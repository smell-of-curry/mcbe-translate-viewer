import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ResourcePackInfo {
  path: string;
  name: string;
  hasTexts: boolean;
  textsPath: string;
}

interface ManifestModule {
  type: string;
  description?: string;
  uuid?: string;
  version?: number[];
}

interface ManifestHeader {
  name?: string;
  description?: string;
  uuid?: string;
  version?: number[];
  min_engine_version?: number[];
}

interface Manifest {
  format_version?: number;
  header?: ManifestHeader;
  modules?: ManifestModule[];
}

/**
 * Checks if a manifest.json file indicates a resource pack
 */
function isResourcePackManifest(manifestPath: string): boolean {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: Manifest = JSON.parse(content);

    if (!manifest.modules || !Array.isArray(manifest.modules)) {
      return false;
    }

    // Check if any module has type "resources"
    return manifest.modules.some(
      (module) => module.type === 'resources'
    );
  } catch {
    return false;
  }
}

/**
 * Gets the pack name from a manifest
 */
function getPackName(manifestPath: string): string {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest: Manifest = JSON.parse(content);
    return manifest.header?.name || path.basename(path.dirname(manifestPath));
  } catch {
    return path.basename(path.dirname(manifestPath));
  }
}

/**
 * Scans a directory for resource packs (looks for manifest.json at root level)
 */
export function scanForResourcePacks(rootPath: string): ResourcePackInfo[] {
  const resourcePacks: ResourcePackInfo[] = [];

  // Check if this directory itself is a resource pack
  const manifestPath = path.join(rootPath, 'manifest.json');
  if (fs.existsSync(manifestPath) && isResourcePackManifest(manifestPath)) {
    const textsPath = path.join(rootPath, 'texts');
    resourcePacks.push({
      path: rootPath,
      name: getPackName(manifestPath),
      hasTexts: fs.existsSync(textsPath),
      textsPath,
    });
  }

  return resourcePacks;
}

/**
 * Scans all workspace folders for resource packs
 */
export function scanWorkspaceForResourcePacks(): ResourcePackInfo[] {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  const allResourcePacks: ResourcePackInfo[] = [];

  for (const folder of workspaceFolders) {
    const packs = scanForResourcePacks(folder.uri.fsPath);
    allResourcePacks.push(...packs);
  }

  return allResourcePacks;
}

/**
 * Scans additional configured paths for resource packs
 */
export function scanConfiguredPaths(additionalPaths: string[]): ResourcePackInfo[] {
  const resourcePacks: ResourcePackInfo[] = [];

  for (const configPath of additionalPaths) {
    // Expand ~ to home directory if present
    const expandedPath = configPath.replace(/^~/, process.env.HOME || '');
    
    if (fs.existsSync(expandedPath)) {
      const packs = scanForResourcePacks(expandedPath);
      resourcePacks.push(...packs);
    }
  }

  return resourcePacks;
}

/**
 * Gets all resource packs from workspace and configured paths
 */
export function getAllResourcePacks(): ResourcePackInfo[] {
  const config = vscode.workspace.getConfiguration('mcbeTranslateViewer');
  const additionalPaths = config.get<string[]>('resourcePackPaths') || [];

  const workspacePacks = scanWorkspaceForResourcePacks();
  const configuredPacks = scanConfiguredPaths(additionalPaths);

  // Combine and deduplicate by path
  const allPacks = [...workspacePacks, ...configuredPacks];
  const uniquePacks = new Map<string, ResourcePackInfo>();
  
  for (const pack of allPacks) {
    if (!uniquePacks.has(pack.path)) {
      uniquePacks.set(pack.path, pack);
    }
  }

  return Array.from(uniquePacks.values());
}

