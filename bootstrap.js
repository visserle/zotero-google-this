const EVENT_TYPE = "createViewContextMenu";
const MAX_QUERY_LENGTH = 2048;
const DEFAULT_MENU_LABEL = "Google this";
const GOOGLE_MENU_MARKER = "__googleThisMenuItem";
const PATCH_STATE_KEY = "__googleThisOpenContextMenuPatch";

let addonID = null;
const patchedReaders = new Set();

function install() {}

async function startup({ id }) {
  addonID = id;
  await Zotero.initializationPromise;
  Zotero.Reader.registerEventListener(EVENT_TYPE, onCreateViewContextMenu, addonID);
}

function shutdown() {
  if (
    typeof Zotero === "undefined" ||
    !Zotero.Reader ||
    !Zotero.Reader.unregisterEventListener
  ) {
    return;
  }

  Zotero.Reader.unregisterEventListener(EVENT_TYPE, onCreateViewContextMenu);
  unpatchAllReaders();
}

function uninstall() {}

function onCreateViewContextMenu(event) {
  try {
    if (!event || typeof event.append !== "function") {
      return;
    }

    ensureReaderContextMenuPatched(event.reader);

    const selectedText = extractSelectionText(event);
    if (!selectedText) {
      return;
    }

    event.append({
      label: getMenuLabel(),
      [GOOGLE_MENU_MARKER]: true,
      onCommand() {
        const currentSelection = extractSelectionText(event) || selectedText;
        if (!currentSelection) {
          return;
        }

        const query = currentSelection.slice(0, MAX_QUERY_LENGTH);
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        Zotero.launchURL(url);
      },
    });
  } catch (error) {
    Zotero.logError(error);
  }
}

function getMenuLabel() {
  try {
    if (typeof browser !== "undefined" && browser?.i18n?.getMessage) {
      const localized = normalizeText(browser.i18n.getMessage("menuGoogleThis"));
      if (localized) {
        return localized;
      }
    }
  } catch (_error) {
    // Fall back to static English label if i18n is unavailable.
  }
  return DEFAULT_MENU_LABEL;
}

function ensureReaderContextMenuPatched(reader) {
  if (!reader || typeof reader._openContextMenu !== "function") {
    return;
  }

  if (reader[PATCH_STATE_KEY]) {
    return;
  }

  const original = reader._openContextMenu;
  const wrapped = function (menuParams) {
    return original.call(this, moveGoogleItemToFront(menuParams));
  };

  reader._openContextMenu = wrapped;
  reader[PATCH_STATE_KEY] = { original, wrapped };
  patchedReaders.add(reader);
}

function unpatchAllReaders() {
  for (const reader of patchedReaders) {
    try {
      const patchState = reader?.[PATCH_STATE_KEY];
      if (!patchState) {
        continue;
      }

      if (reader._openContextMenu === patchState.wrapped) {
        reader._openContextMenu = patchState.original;
      }
      delete reader[PATCH_STATE_KEY];
    } catch (_error) {
      // Ignore reader teardown races during plugin shutdown.
    }
  }

  patchedReaders.clear();
}

function moveGoogleItemToFront(menuParams) {
  if (!menuParams || !Array.isArray(menuParams.itemGroups)) {
    return menuParams;
  }

  const itemGroups = menuParams.itemGroups;
  let googleItem = null;
  let groupIndex = -1;
  let itemIndex = -1;

  for (let i = 0; i < itemGroups.length; i++) {
    const group = itemGroups[i];
    if (!Array.isArray(group)) {
      continue;
    }

    for (let j = 0; j < group.length; j++) {
      if (group[j]?.[GOOGLE_MENU_MARKER]) {
        googleItem = group[j];
        groupIndex = i;
        itemIndex = j;
        break;
      }
    }

    if (googleItem) {
      break;
    }
  }

  if (!googleItem) {
    return menuParams;
  }

  itemGroups[groupIndex].splice(itemIndex, 1);
  if (!itemGroups[groupIndex].length) {
    itemGroups.splice(groupIndex, 1);
  }

  if (!itemGroups.length) {
    itemGroups.push([]);
  }

  itemGroups[0].unshift(googleItem);
  return menuParams;
}

function extractSelectionText(event) {
  const params = event?.params;
  const reader = event?.reader;
  const candidates = [
    params?.annotation?.text,
    params?.text,
    params?.selectedText,
    params?.selectionText,
    params?.selection?.text,
    params?.annotations?.[0]?.text,
    getReaderWindowSelectionText(reader),
    getReaderDocumentSelectionText(reader),
    getSelectionRangesText(reader),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.replace(/\s+/g, " ").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function getReaderViews(reader) {
  return [
    reader?._internalReader?._lastView,
    reader?._internalReader?._primaryView,
    reader?._internalReader?._secondaryView,
    reader?._lastView,
    reader?._primaryView,
    reader?._secondaryView,
  ].filter(Boolean);
}

function getReaderWindowSelectionText(reader) {
  const windows = [
    reader?._iframeWindow,
    ...getReaderViews(reader).map((view) => view?._iframeWindow),
  ];

  for (const win of windows) {
    try {
      const selected = win?.getSelection?.()?.toString?.();
      const normalized = normalizeText(selected);
      if (normalized) {
        return normalized;
      }
    } catch (_error) {
      // Ignore inaccessible/invalid windows and continue.
    }
  }

  return "";
}

function getReaderDocumentSelectionText(reader) {
  const documents = getReaderViews(reader).map((view) => view?._iframeDocument);

  for (const doc of documents) {
    try {
      const selected = doc?.getSelection?.()?.toString?.();
      const normalized = normalizeText(selected);
      if (normalized) {
        return normalized;
      }
    } catch (_error) {
      // Ignore inaccessible/invalid documents and continue.
    }
  }

  return "";
}

function getSelectionRangesText(reader) {
  const possibleViews = [
    reader?._internalReader?._lastView,
    reader?._internalReader?._primaryView,
    reader?._lastView,
    reader?._primaryView,
  ];

  for (const view of possibleViews) {
    const text = textFromSelectionRanges(view?._selectionRanges);
    if (text) {
      return text;
    }
  }

  return "";
}

function textFromSelectionRanges(selectionRanges) {
  if (!Array.isArray(selectionRanges) || !selectionRanges.length) {
    return "";
  }

  if (selectionRanges[0]?.collapsed) {
    return "";
  }

  const text = selectionRanges
    .map((range) => (typeof range?.text === "string" ? range.text : ""))
    .filter(Boolean)
    .join(" ");

  return normalizeText(text);
}

function normalizeText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.replace(/\s+/g, " ").trim();
}
