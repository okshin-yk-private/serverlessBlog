import { promises as fs } from 'node:fs';
import path from 'node:path';

type CommandMeta = {
  description: string;
  argumentHint?: string;
  allowedTools?: string[];
  codexFormat?: 'meta' | 'yaml';
  codexArguments?: Record<string, string>;
  targets?: Array<'claude' | 'codex'>;
  claudePath?: string;
  codexPath?: string;
};

const repoRoot = path.resolve(__dirname, '..');
const aiDir = path.join(repoRoot, '.ai');
const claudeCommandsDir = path.join(repoRoot, '.claude', 'commands');
const codexPromptsDir = path.join(repoRoot, '.codex', 'prompts');
const codexConfigPath = path.join(repoRoot, '.codex', 'config.toml');

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

const newline = '\n';

async function readText(filePath: string) {
  return fs.readFile(filePath, 'utf8');
}

async function writeText(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeIfChanged(filePath: string, content: string) {
  try {
    const existing = await readText(filePath);
    if (existing === content) {
      return false;
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
  }

  if (!checkOnly) {
    await writeText(filePath, content);
  }
  return true;
}

function toYamlFrontmatter(meta: CommandMeta) {
  const lines = ['---'];
  lines.push(`description: ${meta.description}`);
  if (meta.allowedTools && meta.allowedTools.length > 0) {
    lines.push(`allowed-tools: ${meta.allowedTools.join(', ')}`);
  }
  if (meta.argumentHint) {
    lines.push(`argument-hint: ${meta.argumentHint}`);
  }
  lines.push('---');
  return lines.join(newline);
}

function toCodexMeta(meta: CommandMeta) {
  const lines = ['<meta>'];
  lines.push(`description: ${meta.description}`);
  if (meta.argumentHint) {
    lines.push(`argument-hint: ${meta.argumentHint}`);
  }
  if (meta.codexArguments && Object.keys(meta.codexArguments).length > 0) {
    lines.push('arguments:');
    for (const [key, value] of Object.entries(meta.codexArguments)) {
      lines.push(`   ${key}: ${value}`);
    }
  }
  lines.push('</meta>');
  return lines.join(newline);
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(entryPath)));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function normalizeRelPath(relPath: string) {
  return relPath.split(path.sep).join('/');
}

async function syncAgents() {
  const source = path.join(aiDir, 'agents.md');
  const content = await readText(source);
  const changedAgents = await writeIfChanged(
    path.join(repoRoot, 'AGENTS.md'),
    content
  );
  const changedClaude = await writeIfChanged(
    path.join(repoRoot, 'CLAUDE.md'),
    content
  );
  return changedAgents || changedClaude;
}

async function syncMcp() {
  const source = path.join(aiDir, 'mcp.json');
  const content = await readText(source);
  const changedJson = await writeIfChanged(
    path.join(repoRoot, '.mcp.json'),
    content
  );

  const mcpConfig = JSON.parse(content) as {
    mcpServers?: Record<
      string,
      {
        command: string;
        args?: string[];
        env?: Record<string, string>;
        disabled?: boolean;
        autoApprove?: string[];
      }
    >;
  };

  const mcpServers = mcpConfig.mcpServers ?? {};
  const toml = renderMcpToml(mcpServers);
  const changedToml = await updateConfigToml(toml);
  return changedJson || changedToml;
}

async function syncCommands() {
  const commandsDir = path.join(aiDir, 'commands');
  const metaFiles = (await listFilesRecursive(commandsDir)).filter((file) =>
    file.endsWith('.json')
  );

  let changed = false;
  for (const metaFile of metaFiles) {
    if (
      normalizeRelPath(path.relative(commandsDir, metaFile)).startsWith('kiro/')
    ) {
      continue;
    }
    const rawMeta = await readText(metaFile);
    const meta = JSON.parse(rawMeta) as CommandMeta;
    const baseRel = normalizeRelPath(
      path.relative(commandsDir, metaFile).replace(/\.json$/, '')
    );
    const bodyPath = path.join(commandsDir, baseRel + '.md');
    const body = await readText(bodyPath);
    const targets = meta.targets ?? ['claude', 'codex'];

    if (targets.includes('claude')) {
      const claudeRel = meta.claudePath ?? `${baseRel}.md`;
      const claudeOut = path.join(claudeCommandsDir, claudeRel);
      const claudeHeader = toYamlFrontmatter(meta);
      const claudeContent = `${claudeHeader}${newline}${newline}${body}`;
      changed = (await writeIfChanged(claudeOut, claudeContent)) || changed;
    }

    if (targets.includes('codex')) {
      const codexRel = meta.codexPath ?? `${baseRel.replace(/\//g, '-')}.md`;
      const codexOut = path.join(codexPromptsDir, codexRel);
      const codexFormat = meta.codexFormat ?? 'yaml';
      const codexHeader =
        codexFormat === 'meta' ? toCodexMeta(meta) : toYamlFrontmatter(meta);
      const codexContent = `${codexHeader}${newline}${newline}${body}`;
      changed = (await writeIfChanged(codexOut, codexContent)) || changed;
    }
  }
  return changed;
}

function renderTomlString(value: string) {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function renderTomlArray(values: string[]) {
  const entries = values.map((value) => renderTomlString(value));
  return `[${entries.join(', ')}]`;
}

function renderMcpToml(
  servers: Record<
    string,
    {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      disabled?: boolean;
      autoApprove?: string[];
    }
  >
) {
  const lines: string[] = [];
  const names = Object.keys(servers).sort();
  for (const name of names) {
    const server = servers[name];
    lines.push(`[mcp_servers.${renderTomlString(name)}]`);
    lines.push(`command = ${renderTomlString(server.command)}`);
    if (server.args && server.args.length > 0) {
      lines.push(`args = ${renderTomlArray(server.args)}`);
    }
    if (typeof server.disabled === 'boolean') {
      lines.push(`disabled = ${server.disabled ? 'true' : 'false'}`);
    }
    if (server.autoApprove && server.autoApprove.length > 0) {
      lines.push(`autoApprove = ${renderTomlArray(server.autoApprove)}`);
    }
    if (server.env && Object.keys(server.env).length > 0) {
      lines.push(`[mcp_servers.${renderTomlString(name)}.env]`);
      const envKeys = Object.keys(server.env).sort();
      for (const key of envKeys) {
        lines.push(`${key} = ${renderTomlString(server.env[key] ?? '')}`);
      }
    }
    lines.push('');
  }
  return lines.join(newline).trimEnd();
}

async function updateConfigToml(mcpToml: string) {
  const markerStart = '# BEGIN AI-MCP';
  const markerEnd = '# END AI-MCP';
  const block = `${markerStart}${newline}${mcpToml}${newline}${markerEnd}`;
  let content = '';
  try {
    content = await readText(codexConfigPath);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') {
      throw error;
    }
  }

  let nextContent = '';
  if (content.includes(markerStart) && content.includes(markerEnd)) {
    const regex = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`, 'm');
    nextContent = content.replace(regex, block);
  } else if (content.length > 0) {
    nextContent = `${content}${newline}${newline}${block}${newline}`;
  } else {
    nextContent = `${block}${newline}`;
  }

  return writeIfChanged(codexConfigPath, nextContent);
}

async function main() {
  const changed =
    (await syncAgents()) || (await syncMcp()) || (await syncCommands());

  if (checkOnly && changed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
