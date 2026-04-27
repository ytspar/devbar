/**
 * Console popup rendering for the DevBar.
 */

import type { ConsoleCapture } from '@ytspar/sweetlink/browser/consoleCapture';
import { BUTTON_COLORS, CSS_COLORS } from '../../constants.js';
import type { ConsoleLog } from '../../types.js';
import {
  createEmptyMessage,
  createModalBox,
  createModalContent,
  createModalHeader,
  createModalOverlay,
  focusModal,
} from '../../ui/index.js';
import { consoleLogsToMarkdown, handleSaveConsoleLogs } from '../screenshot.js';
import type { DevBarState } from '../types.js';
import { createModalEvidenceContext } from './evidenceContext.js';

export function renderConsolePopup(
  state: DevBarState,
  consoleCaptureSingleton: ConsoleCapture
): void {
  const filterType = state.consoleFilter;
  if (!filterType) return;

  const logs = consoleCaptureSingleton
    .getLogs()
    .filter((log: ConsoleLog) => log.level === filterType);
  const colorMap = {
    error: BUTTON_COLORS.error,
    warn: BUTTON_COLORS.warning,
    info: BUTTON_COLORS.info,
  };
  const color = colorMap[filterType];
  const labelMap = { error: 'Errors', warn: 'Warnings', info: 'Info' } as const;
  const label = labelMap[filterType];

  const closeModal = () => {
    state.consoleFilter = null;
    state.render();
  };

  const overlay = createModalOverlay(closeModal);
  const modal = createModalBox(color, `Console ${label}`);

  const header = createModalHeader({
    color,
    title: `Console ${label} (${logs.length})`,
    onClose: closeModal,
    onCopyMd: async () => {
      await navigator.clipboard.writeText(consoleLogsToMarkdown(logs));
    },
    onSave: () => handleSaveConsoleLogs(state, logs),
    onClear: () => state.clearConsoleLogs(),
    sweetlinkConnected: state.sweetlinkConnected,
    saveLocation: state.options.saveLocation,
    isSaving: state.savingConsoleLogs,
    savedPath: state.lastConsoleLogs,
    evidenceContext: createModalEvidenceContext(state, `Console ${label}`, {
      artifactPath: state.lastConsoleLogs,
      observation: `${logs.length} ${filterType} log${logs.length === 1 ? '' : 's'} in the current filter.`,
    }),
  });
  modal.appendChild(header);

  const content = createModalContent();

  if (logs.length === 0) {
    content.appendChild(createEmptyMessage(`No ${filterType}s recorded`));
  } else {
    renderConsoleLogs(content, logs, color);
  }

  modal.appendChild(content);
  overlay.appendChild(modal);

  state.overlayElement = overlay;
  document.body.appendChild(overlay);
  focusModal(modal);
}

function renderConsoleLogs(container: HTMLElement, logs: ConsoleLog[], color: string): void {
  logs.forEach((log, index) => {
    const logItem = document.createElement('div');
    Object.assign(logItem.style, {
      padding: '8px 14px',
      borderBottom: index < logs.length - 1 ? `1px solid ${CSS_COLORS.borderSubtle}` : 'none',
    });

    const timestamp = document.createElement('span');
    Object.assign(timestamp.style, {
      color: CSS_COLORS.textMuted,
      fontSize: '0.625rem',
      marginRight: '8px',
    });
    timestamp.textContent = new Date(log.timestamp).toLocaleTimeString();
    logItem.appendChild(timestamp);

    const message = document.createElement('span');
    Object.assign(message.style, {
      color,
      fontSize: '0.6875rem',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',
    });
    message.textContent = log.message;
    logItem.appendChild(message);

    container.appendChild(logItem);
  });
}
