'use client';

import { useEffect } from 'react';
import {
  callWebMcpTool,
  listWebMcpTools,
  type WebMcpToolResult,
} from '@/lib/webmcp/client';
import type { Locale } from '@/lib/i18n/locale';

interface WebMcpInstance {
  registerTool(
    name: string,
    description: string,
    schema: Record<string, unknown>,
    execute: (args: Record<string, unknown>) => Promise<WebMcpToolResult>,
  ): void;
}

declare global {
  interface Window {
    WebMCP?: new (options?: Record<string, unknown>) => WebMcpInstance;
    webMCP?: WebMcpInstance;
  }
}

const BRIDGE_COMMAND = 'npx -y @jason.today/webmcp@latest --mcp';

const COPY = {
  zh: {
    trigger: '连接 WebMCP',
    connected: 'WebMCP 已连接',
    intro: '让你的 AI 助手使用本站知识检索工具',
    steps: [
      '在 MCP 客户端新增名为 webmcp 的服务器，启动命令：',
      '让助手生成一个 WebMCP token（也可在终端运行 npx -y @jason.today/webmcp@latest --new）。',
      '把 token 粘贴到下方，然后点击 Connect。',
    ],
    copy: '复制命令',
    copied: '已复制',
    guide: '完整使用说明',
    token: '粘贴连接 token',
    connect: '连接',
    disconnect: '断开连接',
    disconnected: '未连接',
  },
  en: {
    trigger: 'Connect WebMCP',
    connected: 'WebMCP connected',
    intro: 'Let your AI assistant use this site’s knowledge tools',
    steps: [
      'Add an MCP server named webmcp to your client with this command:',
      'Ask your assistant for a WebMCP token (or run npx -y @jason.today/webmcp@latest --new).',
      'Paste the token below, then select Connect.',
    ],
    copy: 'Copy command',
    copied: 'Copied',
    guide: 'Full setup guide',
    token: 'Paste connection token',
    connect: 'Connect',
    disconnect: 'Disconnect',
    disconnected: 'Disconnected',
  },
} as const;

function addUsageGuide(locale: Locale) {
  const widget = document.querySelector<HTMLElement>('[data-webmcp-widget]');
  const panel = widget?.querySelector<HTMLElement>('.webmcp-content');
  const form = panel?.querySelector<HTMLElement>('.webmcp-form');
  if (!panel || !form || panel.querySelector('[data-re0-webmcp-guide]')) return;

  const copy = COPY[locale];
  panel.style.width = '320px';
  panel.style.maxWidth = 'calc(100vw - 40px)';
  panel.style.maxHeight = 'calc(100vh - 80px)';
  panel.style.boxSizing = 'border-box';
  panel.style.overflowY = 'auto';

  const tokenInput = panel.querySelector<HTMLInputElement>('.webmcp-token-input');
  const connectButton = panel.querySelector<HTMLButtonElement>('.webmcp-connect-btn');
  const disconnectButton = panel.querySelector<HTMLButtonElement>('.webmcp-disconnect-btn');
  const status = panel.querySelector<HTMLElement>('.webmcp-status');
  if (tokenInput) tokenInput.placeholder = copy.token;
  if (connectButton) connectButton.textContent = copy.connect;
  if (disconnectButton) disconnectButton.textContent = copy.disconnect;
  if (status) status.textContent = copy.disconnected;

  const guide = document.createElement('div');
  guide.dataset.re0WebmcpGuide = 'true';
  Object.assign(guide.style, {
    marginBottom: '14px',
    color: '#294043',
    fontSize: '12px',
    lineHeight: '1.5',
  });

  const intro = document.createElement('p');
  intro.textContent = copy.intro;
  Object.assign(intro.style, { margin: '0 0 8px', fontWeight: '600' });
  guide.appendChild(intro);

  const steps = document.createElement('ol');
  Object.assign(steps.style, { margin: '0', paddingLeft: '18px' });
  copy.steps.forEach((text, index) => {
    const item = document.createElement('li');
    item.textContent = text;
    item.style.marginBottom = index === copy.steps.length - 1 ? '0' : '6px';
    steps.appendChild(item);

    if (index === 0) {
      const command = document.createElement('code');
      command.textContent = BRIDGE_COMMAND;
      Object.assign(command.style, {
        display: 'block',
        marginTop: '5px',
        padding: '6px 7px',
        overflowWrap: 'anywhere',
        borderRadius: '4px',
        background: '#edf7f5',
        color: '#075e54',
        fontSize: '10px',
      });
      item.appendChild(command);

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.textContent = copy.copy;
      Object.assign(copyButton.style, {
        marginTop: '5px',
        padding: '3px 7px',
        border: '1px solid #a7cbc6',
        borderRadius: '4px',
        background: '#fff',
        color: '#075e54',
        cursor: 'pointer',
        fontSize: '10px',
      });
      copyButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(BRIDGE_COMMAND);
          copyButton.textContent = copy.copied;
        } catch {
          command.scrollIntoView({ block: 'nearest' });
        }
      });
      item.appendChild(copyButton);
    }
  });
  guide.appendChild(steps);

  const guideLink = document.createElement('a');
  guideLink.href = 'https://webmcp.dev/';
  guideLink.target = '_blank';
  guideLink.rel = 'noreferrer';
  guideLink.textContent = copy.guide;
  Object.assign(guideLink.style, {
    display: 'inline-block',
    marginTop: '8px',
    color: '#007f72',
    textDecoration: 'underline',
  });
  guide.appendChild(guideLink);
  panel.insertBefore(guide, form);
}

/**
 * Installs webmcp.dev's browser bridge once for the whole application. Tool
 * calls still cross the same-origin /mcp boundary, so the browser does not
 * contain a second implementation of retrieval or accept an API key.
 */
export function WebMcpProvider({ locale }: { locale: Locale }) {
  useEffect(() => {
    let active = true;

    const initialize = async () => {
      if (!active || window.webMCP || !window.WebMCP) return;

      const mcp = new window.WebMCP({
        color: '#009688',
        position: 'bottom-right',
        size: '34px',
        padding: '20px',
        triggerLabel: COPY[locale].trigger,
        connectedLabel: COPY[locale].connected,
      });
      window.webMCP = mcp;
      addUsageGuide(locale);

      try {
        const tools = await listWebMcpTools();
        if (!active) return;
        for (const tool of tools) {
          mcp.registerTool(tool.name, tool.description, tool.inputSchema, (args) =>
            callWebMcpTool(tool.name, args ?? {}),
          );
        }
      } catch (error) {
        console.error(
          `WebMCP initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    };

    if (window.WebMCP) {
      void initialize();
      return () => {
        active = false;
      };
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-re0-webmcp]');
    if (!script) {
      script = document.createElement('script');
      script.src = '/vendor/webmcp/webmcp.js';
      script.async = true;
      script.dataset.re0Webmcp = 'true';
      document.body.appendChild(script);
    }
    const onLoad = () => void initialize();
    const onError = () => console.error('WebMCP script failed to load');
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (window.WebMCP) void initialize();

    return () => {
      active = false;
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
    };
  }, [locale]);

  return null;
}
