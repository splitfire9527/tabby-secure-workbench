import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, Optional, HostListener } from '@angular/core'
import { AppService, ConfigService, NotificationsService, ProfilesService } from 'tabby-core'
import { Subscription } from 'rxjs'
import { ActivityTab } from './workbench-activity-bar.component'
import { DirectoryPair } from '../sftp-plus/directory-pair.model'
import { DEFAULT_WORKBENCH_CONFIG, FrameworkTheme } from '../config/config.model'
import { WorkbenchDialogService } from './workbench-dialog.service'
import { WorkbenchSessionStateService } from './workbench-session-state.service'

export function parseConnectionTarget(target: string): { user?: string; host: string; port: number } {
  let clean = (target || '').trim().replace(/^ssh\s+/i, '').replace(/^telnet\s+/i, '')
  let user: string | undefined = undefined
  let host = ''
  let port = 22

  if (clean.includes('@')) {
    const parts = clean.split('@')
    user = parts[0].trim() || undefined
    clean = parts.slice(1).join('@')
  }

  if (clean.includes(':')) {
    const parts = clean.split(':')
    host = parts[0].trim()
    const p = parseInt(parts[1], 10)
    if (!isNaN(p) && p > 0) {
      port = p
    }
  } else {
    host = clean.trim()
  }

  return { user, host, port }
}

export function matchProfile(p: any, rawQuery: string): boolean {
  if (!rawQuery) return true
  let q = rawQuery.toLowerCase().trim()
  if (!q) return true
  if (q.startsWith('ssh ')) {
    q = q.replace(/^ssh\s+/, '')
  }

  const name = (p.name || '').toLowerCase()
  const host = (p.options?.host || '').toLowerCase()
  const user = (p.options?.user || '').toLowerCase()
  const group = (p.group || '').toLowerCase()
  const port = String(p.options?.port || 22)
  const userHost = `${user}@${host}`
  const userHostPort = `${user}@${host}:${port}`
  const hostPort = `${host}:${port}`

  if (
    name.includes(q) ||
    host.includes(q) ||
    user.includes(q) ||
    group.includes(q) ||
    userHost.includes(q) ||
    userHostPort.includes(q) ||
    hostPort.includes(q)
  ) {
    return true
  }

  if (q.includes('@')) {
    const parts = q.split('@')
    const qUser = parts[0]
    const rest = parts[1] || ''
    const qHost = rest.split(':')[0]
    if (qHost && (host.includes(qHost) || name.includes(qHost) || qHost.includes(host))) {
      return true
    }
    if (qUser && (user.includes(qUser) || name.includes(qUser))) {
      return true
    }
  }

  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) {
    const combined = `${name} ${user} ${host} ${port} ${group}`
    if (tokens.every(token => combined.includes(token))) {
      return true
    }
  }

  return false
}

interface ProfileFolderGroup {
  name: string
  profiles: any[]
  expanded: boolean
}

@Component({
  selector: 'workbench-drawer',
  host: {
    '[style.width.px]': 'drawerWidth',
    '[style.min-width.px]': 'drawerWidth',
    '[style.max-width.px]': 'drawerWidth',
  },
  template: `
    <!-- Drawer Title Header with Compact Action Icons -->
    <div class="drawer-header">
      <div class="d-flex align-items-center">
        <span class="drawer-title">{{ title }}</span>
      </div>
      <div class="header-action-icons d-flex align-items-center gap-1" *ngIf="activeTab === 'sessions'">
        <button class="btn-header-tool" (click)="createNewSession()" title="新建会话配置">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="btn-header-tool" (click)="createNewFolder()" title="新建目录分组">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="14" x2="15" y2="14"></line>
          </svg>
        </button>
        <button class="btn-header-tool" (click)="toggleFolderGroupExpand()" title="全部展开/折叠目录">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="7 15 12 20 17 15"></polyline>
            <polyline points="7 9 12 4 17 9"></polyline>
          </svg>
        </button>
        <button class="btn-header-tool" (click)="loadProfiles()" title="刷新会话列表">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
      <button class="btn-close-drawer" (click)="closeDrawer.emit()" title="折叠侧边栏">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
          <polyline points="14 9 11 12 14 15"></polyline>
        </svg>
      </button>
    </div>

    <!-- 1. Sessions Drawer (SecureCRT Session Manager) -->
    <div *ngIf="activeTab === 'sessions'" class="drawer-panel">
      <!-- Filter Box -->
      <div class="search-box">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#7f848e" stroke-width="2" class="search-icon">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          class="search-input"
          placeholder="搜索会话、主机(如 root@127.0.0.1)或分组..."
          [(ngModel)]="sessionFilter"
          (keydown)="onSearchKeyDown($event)"
        />
        <button *ngIf="sessionFilter" class="btn-clear-search" (click)="sessionFilter = ''">&times;</button>
      </div>

      <!-- Session Tree (Saved, Imported, Built-in) -->
      <div class="session-tree scrollable">
        <!-- 1. Saved Profiles -->
        <div class="tree-category-group">
          <div class="tree-category-header" *ngIf="!shouldHideSavedRoot" (click)="savedExpanded = !savedExpanded; onSelectCategory('saved')">
            <span class="tree-arrow" [class.open]="savedExpanded">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <svg *ngIf="savedExpanded" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
              <path d="M5 19l2-8h14l-2 8H5z"></path>
              <path d="M7 11V5a2 2 0 0 1 2-2h4l2 3h5a2 2 0 0 1 2 2v3"></path>
            </svg>
            <svg *ngIf="!savedExpanded" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="tree-label font-weight-bold">自建会话</span>
            <span class="tree-count ml-auto">({{ savedProfilesList.length }})</span>
          </div>

          <div *ngIf="savedExpanded || shouldHideSavedRoot" class="tree-category-children" [class.with-guide]="!shouldHideSavedRoot">
            <!-- Folders -->
            <div *ngFor="let group of savedFilteredData.groups; trackBy: trackByGroupName" class="tree-group-container">
              <div
                class="tree-node tree-folder"
                (click)="toggleFolder(group.name); onSelectCategory('group', group.name)"
                (contextmenu)="onFolderContextMenu(group.name, $event)"
              >
                <span class="tree-arrow" [class.open]="isFolderExpanded(group.name)">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </span>
                <svg *ngIf="isFolderExpanded(group.name)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
                  <path d="M5 19l2-8h14l-2 8H5z"></path>
                  <path d="M7 11V5a2 2 0 0 1 2-2h4l2 3h5a2 2 0 0 1 2 2v3"></path>
                </svg>
                <svg *ngIf="!isFolderExpanded(group.name)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="tree-label font-weight-500">{{ getGroupDisplayName(group.name) }}</span>
                <span class="tree-count ml-auto">({{ group.profiles.length }})</span>
              </div>
              <div *ngIf="isFolderExpanded(group.name)" class="tree-group-children">
                <ng-container *ngFor="let p of group.profiles; trackBy: trackByProfileId">
                  <div
                    class="tree-session-row"
                    tabindex="0"
                    [class.selected]="selectedProfile?.id === p.id"
                    [class.active]="isProfileActive(p)"
                    (click)="onSelectProfile(p, $event)"
                    (dblclick)="onConnectProfile(p)"
                    (keydown)="onRowKeyDown($event, p)"
                    (contextmenu)="onProfileContextMenu(p, $event)"
                    [title]="getProfileTooltip(p)"
                  >
                    <span class="tree-arrow-spacer"></span>
                    <i [class]="getProfileIconClass(p)" class="session-type-icon mr-1 flex-shrink-0" [style.color]="getProfileIconColor(p)"></i>
                    <span class="session-title text-truncate mr-1">{{ getProfilePrimaryName(p) }}</span>
                    <span class="session-host-text font-mono text-truncate text-muted" *ngIf="getProfileSecondaryText(p)">
                      {{ getProfileSecondaryText(p) }}
                    </span>
                    <span *ngIf="getProfileTypeBadge(p)" class="badge-proto-tag font-mono flex-shrink-0 ml-1">
                      {{ getProfileTypeBadge(p) }}
                    </span>
                    <button
                      *ngIf="isSshProfile(p)"
                      class="btn-sftp-hover-action"
                      (click)="onOpenSftp(p, $event)"
                      title="打开文件传输 (SFTP 全屏)"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  </div>
                </ng-container>
              </div>
            </div>

            <!-- Ungrouped -->
            <div
              *ngFor="let p of savedFilteredData.ungrouped; trackBy: trackByProfileId"
              class="tree-session-row"
              tabindex="0"
              [class.selected]="selectedProfile?.id === p.id"
              [class.active]="isProfileActive(p)"
              (click)="onSelectProfile(p, $event)"
              (dblclick)="onConnectProfile(p)"
              (keydown)="onRowKeyDown($event, p)"
              (contextmenu)="onProfileContextMenu(p, $event)"
              [title]="getProfileTooltip(p)"
            >
              <span class="tree-arrow-spacer"></span>
              <i [class]="getProfileIconClass(p)" class="session-type-icon mr-1 flex-shrink-0" [style.color]="getProfileIconColor(p)"></i>
              <span class="session-title text-truncate mr-1">{{ getProfilePrimaryName(p) }}</span>
              <span class="session-host-text font-mono text-truncate text-muted" *ngIf="getProfileSecondaryText(p)">
                {{ getProfileSecondaryText(p) }}
              </span>
              <span *ngIf="getProfileTypeBadge(p)" class="badge-proto-tag font-mono flex-shrink-0 ml-1">
                {{ getProfileTypeBadge(p) }}
              </span>
              <button
                *ngIf="isSshProfile(p)"
                class="btn-sftp-hover-action"
                (click)="onOpenSftp(p, $event)"
                title="打开文件传输 (SFTP 全屏)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>

            <div *ngIf="savedProfilesList.length === 0" class="text-muted small text-center p-2">
              暂无自建会话，点击上方新建按钮创建
            </div>
          </div>
        </div>

        <!-- 2. Imported Profiles -->
        <div class="tree-category-group" *ngIf="showImportedSessions && importedProfilesList.length > 0">
          <div class="tree-category-header" (click)="importedExpanded = !importedExpanded; onSelectCategory('imported')">
            <span class="tree-arrow" [class.open]="importedExpanded">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="tree-label font-weight-bold">导入会话</span>
            <span class="tree-count ml-auto">({{ importedProfilesList.length }})</span>
          </div>

          <div *ngIf="importedExpanded" class="tree-category-children with-guide">
            <div *ngFor="let group of importedFilteredData.groups; trackBy: trackByGroupName" class="tree-group-container">
              <div
                class="tree-node tree-folder"
                (click)="toggleFolder(group.name); onSelectCategory('group', group.name)"
                (contextmenu)="onFolderContextMenu(group.name, $event)"
              >
                <span class="tree-arrow" [class.open]="isFolderExpanded(group.name)">
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </span>
                <svg *ngIf="isFolderExpanded(group.name)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
                  <path d="M5 19l2-8h14l-2 8H5z"></path>
                  <path d="M7 11V5a2 2 0 0 1 2-2h4l2 3h5a2 2 0 0 1 2 2v3"></path>
                </svg>
                <svg *ngIf="!isFolderExpanded(group.name)" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span class="tree-label font-weight-500">{{ getGroupDisplayName(group.name) }}</span>
                <span class="tree-count ml-auto">({{ group.profiles.length }})</span>
              </div>
              <div *ngIf="isFolderExpanded(group.name)" class="tree-group-children">
                <div
                  *ngFor="let p of group.profiles; trackBy: trackByProfileId"
                  class="tree-session-row"
                  tabindex="0"
                  [class.selected]="selectedProfile?.id === p.id"
                  [class.active]="isProfileActive(p)"
                  (click)="onSelectProfile(p, $event)"
                  (dblclick)="onConnectProfile(p)"
                  (keydown)="onRowKeyDown($event, p)"
                  (contextmenu)="onProfileContextMenu(p, $event)"
                  [title]="getProfileTooltip(p)"
                >
                  <span class="tree-arrow-spacer"></span>
                  <i [class]="getProfileIconClass(p)" class="session-type-icon mr-1 flex-shrink-0" [style.color]="getProfileIconColor(p)"></i>
                  <span class="session-title text-truncate mr-1">{{ getProfilePrimaryName(p) }}</span>
                  <span class="session-host-text font-mono text-truncate text-muted" *ngIf="getProfileSecondaryText(p)">
                    {{ getProfileSecondaryText(p) }}
                  </span>
                  <span *ngIf="getProfileTypeBadge(p)" class="badge-proto-tag font-mono flex-shrink-0 ml-1">
                    {{ getProfileTypeBadge(p) }}
                  </span>
                  <button
                    *ngIf="isSshProfile(p)"
                    class="btn-sftp-hover-action"
                    (click)="onOpenSftp(p, $event)"
                    title="打开文件传输 (SFTP 全屏)"
                  >
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div
              *ngFor="let p of importedFilteredData.ungrouped; trackBy: trackByProfileId"
              class="tree-session-row"
              tabindex="0"
              [class.selected]="selectedProfile?.id === p.id"
              [class.active]="isProfileActive(p)"
              (click)="onSelectProfile(p, $event)"
              (dblclick)="onConnectProfile(p)"
              (keydown)="onRowKeyDown($event, p)"
              (contextmenu)="onProfileContextMenu(p, $event)"
              [title]="getProfileTooltip(p)"
            >
              <span class="tree-arrow-spacer"></span>
              <i [class]="getProfileIconClass(p)" class="session-type-icon mr-1 flex-shrink-0" [style.color]="getProfileIconColor(p)"></i>
              <span class="session-title text-truncate mr-1">{{ getProfilePrimaryName(p) }}</span>
              <span class="session-host-text font-mono text-truncate text-muted" *ngIf="getProfileSecondaryText(p)">
                {{ getProfileSecondaryText(p) }}
              </span>
              <span *ngIf="getProfileTypeBadge(p)" class="badge-proto-tag font-mono flex-shrink-0 ml-1">
                {{ getProfileTypeBadge(p) }}
              </span>
              <button
                *ngIf="isSshProfile(p)"
                class="btn-sftp-hover-action"
                (click)="onOpenSftp(p, $event)"
                title="打开文件传输 (SFTP 全屏)"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- 3. Built-in Shells (Configurable, default hidden) -->
        <div class="tree-category-group" *ngIf="showBuiltinSessions && builtinProfilesList.length > 0">
          <div class="tree-category-header" (click)="builtinExpanded = !builtinExpanded; onSelectCategory('builtin')">
            <span class="tree-arrow" [class.open]="builtinExpanded">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tree-icon-svg mr-2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span class="tree-label font-weight-bold">内置终端</span>
            <span class="tree-count ml-auto">({{ builtinProfilesList.length }})</span>
          </div>

          <div *ngIf="builtinExpanded" class="tree-category-children with-guide">
            <div
              *ngFor="let p of builtinFilteredData.ungrouped.concat(builtinFilteredData.groups.length ? builtinFilteredData.groups[0].profiles : []); trackBy: trackByProfileId"
              class="tree-session-row"
              tabindex="0"
              [class.selected]="selectedProfile?.id === p.id"
              [class.active]="isProfileActive(p)"
              (click)="onSelectProfile(p, $event)"
              (dblclick)="onConnectProfile(p)"
              (keydown)="onRowKeyDown($event, p)"
              (contextmenu)="onProfileContextMenu(p, $event)"
              [title]="getProfileTooltip(p)"
            >
              <span class="tree-arrow-spacer"></span>
              <i [class]="getProfileIconClass(p)" class="session-type-icon mr-1 flex-shrink-0" [style.color]="getProfileIconColor(p)"></i>
              <span class="session-title text-truncate mr-1">{{ getProfilePrimaryName(p) }}</span>
              <span class="session-host-text font-mono text-truncate text-muted" *ngIf="getProfileSecondaryText(p)">
                {{ getProfileSecondaryText(p) }}
              </span>
              <span *ngIf="getProfileTypeBadge(p)" class="badge-proto-tag font-mono flex-shrink-0 ml-1">
                {{ getProfileTypeBadge(p) }}
              </span>
            </div>
          </div>
        </div>

        <div *ngIf="totalProfilesCount === 0" class="text-muted small text-center p-3">
          暂无保存的会话配置，点击上方新建按钮开始创建。
        </div>
      </div>
    </div>

    <!-- 2. Active Sessions Drawer -->
    <div *ngIf="activeTab === 'active-sessions'" class="drawer-panel scrollable">
      <div class="active-session-list">
        <div
          *ngFor="let s of availableSessions"
          class="active-session-item p-2 mb-1 rounded d-flex justify-content-between align-items-center"
          (click)="selectSession.emit(s)"
          [class.active]="s === activeTerminalTab"
        >
          <div class="text-truncate mr-2">
            <div class="font-weight-bold small text-truncate text-light">{{ s.title || s.name || 'Terminal Session' }}</div>
            <div class="text-muted small" style="font-size: 12px;">
              {{ s.profile?.options?.user || 'user' }}&#64;{{ s.profile?.options?.host || 'localhost' }}
            </div>
          </div>
          <span
            class="status-dot"
            [class.online]="s.session?.open !== false"
            [class.offline]="s.session?.open === false"
          ></span>
        </div>
        <div *ngIf="availableSessions.length === 0" class="text-muted small text-center p-3">
          暂无已打开的活动终端会话。
        </div>
      </div>
    </div>

    <!-- 3. Commands Drawer (Command Manager) -->
    <div *ngIf="activeTab === 'commands'" class="drawer-panel">
      <workbench-command-library [activeTerminalTab]="activeTerminalTab"></workbench-command-library>
    </div>

    <!-- 4. Settings Drawer -->
    <div *ngIf="activeTab === 'settings'" class="drawer-panel scrollable">
      <div class="text-center p-3">
        <p class="small text-muted">请点击左侧活动栏底部的设置图标打开完整设置面板。</p>
      </div>
    </div>

    <!-- 5. About Drawer -->
    <div *ngIf="activeTab === 'about'" class="drawer-panel scrollable small text-muted">
      <h6 class="text-dark font-weight-bold mb-2">Tabby Secure Workbench</h6>
      <p class="mb-1">Version: 1.0.0</p>
      <p class="mb-2">License: MIT</p>
      <p class="mb-3">
        A professional SSH workbench plugin for Tabby inspired by SecureCRT, featuring Session Manager tree, Command Manager, Stateful Codec, per-tab transfer queues, verified session logging, and cross-connection transfer.
      </p>
    </div>

    <!-- Folder Right-Click Context Menu -->
    <div
      *ngIf="showFolderContextMenu"
      class="session-context-menu shadow-lg"
      [style.left.px]="contextMenuPos.x"
      [style.top.px]="contextMenuPos.y"
      (click)="$event.stopPropagation()"
    >
      <div class="menu-item font-weight-bold" (click)="onFolderMenuNewSession()">
        <span class="menu-icon">➕</span>
        <span>新建会话</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item" (click)="onFolderMenuRename()">
        <span class="menu-icon">✏️</span>
        <span>重命名目录</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item text-danger" (click)="onFolderMenuDelete()">
        <span class="menu-icon">🗑️</span>
        <span>删除目录</span>
      </div>
    </div>

    <!-- Session Right-Click Context Menu -->
    <div
      *ngIf="showContextMenu"
      class="session-context-menu shadow-lg"
      [style.left.px]="contextMenuPos.x"
      [style.top.px]="contextMenuPos.y"
      (click)="$event.stopPropagation()"
    >
      <div class="menu-item font-weight-bold" (click)="onMenuConnect()">
        <span class="menu-icon">➔</span>
        <span>连接</span>
      </div>
      <div class="menu-item" (click)="onMenuConnectNewTab()">
        <span class="menu-icon">🗂️</span>
        <span>在新标签页中连接</span>
      </div>
      <div class="menu-item" *ngIf="isSshProfile(contextMenuProfile)" (click)="onMenuSftp()">
        <span class="menu-icon">📁</span>
        <span>打开文件传输 (SFTP)</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item" (click)="onMenuEdit()">
        <span class="menu-icon">✏️</span>
        <span>编辑会话</span>
      </div>
      <div class="menu-item" (click)="onMenuDuplicate()">
        <span class="menu-icon">📋</span>
        <span>复制会话</span>
      </div>
      <div class="menu-separator"></div>
      <div class="menu-item text-danger" (click)="onMenuDelete()">
        <span class="menu-icon">🗑️</span>
        <span>删除会话</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #f0f2f5;
        border-right: 1px solid #d0d4dc;
        padding: 8px 10px;
        box-sizing: border-box;
        flex-shrink: 0;
        overflow: hidden;
        user-select: none;
        color: #222222;
      }
      .tree-icon-svg {
        width: 13px !important;
        height: 13px !important;
        min-width: 13px !important;
        max-width: 13px !important;
        min-height: 13px !important;
        max-height: 13px !important;
        flex-shrink: 0 !important;
        display: inline-block !important;
        vertical-align: middle !important;
        box-sizing: content-box !important;
      }
      .drawer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        flex-shrink: 0;
        height: 26px;
      }
      .drawer-title {
        font-weight: 700;
        margin: 0;
        color: #222222;
        font-size: 12px;
        letter-spacing: 0.5px;
      }
      .header-action-icons {
        margin-left: auto;
        margin-right: 6px;
      }
      .btn-header-tool {
        width: 22px;
        height: 22px;
        border-radius: 3px;
        border: 1px solid transparent;
        background: transparent;
        color: #475569;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: all 0.1s ease;

        &:hover:not([disabled]) {
          background: #e2e8f0;
          color: #0f172a;
          border-color: #cbd5e1;
        }
        &[disabled] {
          opacity: 0.35;
          cursor: not-allowed;
        }
      }
      .btn-close-drawer {
        background: transparent;
        border: none;
        color: #666666;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        cursor: pointer;
      }
      .btn-close-drawer:hover {
        color: #000000;
      }
      .search-box {
        position: relative;
        display: flex;
        align-items: center;
        margin-bottom: 4px;
        flex-shrink: 0;
      }
      .search-icon {
        position: absolute;
        left: 8px;
        pointer-events: none;
        color: #888888;
      }
      .search-input {
        width: 100%;
        background: #ffffff !important;
        border: 1px solid #d0d4dc !important;
        color: #222222 !important;
        border-radius: 3px;
        padding: 4px 24px 4px 26px;
        font-size: 12px;
        outline: none;
        box-sizing: border-box;
      }
      .search-input:focus {
        border-color: #1e70bf !important;
        box-shadow: 0 0 0 1px rgba(30, 112, 191, 0.4);
      }
      .search-input::placeholder {
        color: #888888;
        font-size: 11px;
      }
      .btn-clear-search {
        position: absolute;
        right: 6px;
        background: none;
        border: none;
        color: #666666;
        font-size: 14px;
        cursor: pointer;
        padding: 0;
      }
      .drawer-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
      }
      .drawer-panel.scrollable {
        overflow-y: auto;
      }
      .session-tree {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        background: #ffffff;
        border: 1px solid #d0d4dc;
        border-radius: 3px;
        padding: 4px 0;
      }
      .tree-category-group + .tree-category-group {
        margin-top: 8px;
      }
      .tree-category-children {
        padding-left: 0;

        &.with-guide {
          margin-left: 13px;
          border-left: 1px solid #e2e8f0;
          padding-left: 2px;
        }
      }
      .tree-category-header,
      .tree-node.tree-folder {
        display: flex;
        align-items: center;
        height: 26px;
        min-height: 26px;
        max-height: 26px;
        line-height: 26px;
        margin: 1px 4px;
        padding: 0 6px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        color: #334155;
        user-select: none;
        transition: background 0.1s ease, color 0.1s ease;

        &:hover {
          background: rgba(0, 0, 0, 0.04);
          color: #111827;
        }

        &.selected {
          background: #e2e8f0;
          color: #0f172a;
        }
      }
      .tree-arrow {
        width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-right: 4px;
        color: #9ca3af;
        transition: transform 0.15s ease, color 0.15s ease;
        flex-shrink: 0;

        &.open {
          transform: rotate(90deg);
          color: #4b5563;
        }
      }
      .tree-arrow-spacer {
        width: 14px;
        min-width: 14px;
        margin-right: 4px;
        display: inline-block;
        flex-shrink: 0;
      }
      .tree-icon-svg {
        flex-shrink: 0;
        color: #6b7280;
      }
      .tree-children {
        padding-left: 12px;
      }
      .tree-group-children {
        margin-left: 13px;
        padding-left: 3px;
        border-left: 1px solid #e2e8f0;
      }
      .tree-label {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tree-count {
        font-size: 11px;
        color: #94a3b8;
        font-family: inherit;
      }
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
        background: #94a3b8;
      }
      .status-dot.online {
        background: #16a34a;
        box-shadow: 0 0 5px rgba(22, 163, 74, 0.5);
      }
      .status-dot.offline {
        background: #dc3545;
      }
      .tree-session-row {
        display: flex;
        align-items: center;
        height: 26px;
        min-height: 26px;
        max-height: 26px;
        cursor: pointer;
        background: transparent;
        border: none;
        border-radius: 4px;
        margin: 1px 4px;
        padding: 0 6px;
        box-sizing: border-box;
        transition: background 0.1s ease, color 0.1s ease;
        line-height: 26px;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        &.selected {
          background: #e0f2fe !important;
          border-left: 3px solid #1e70bf !important;
          color: #0c4a6e !important;

          .session-title {
            color: #0c4a6e !important;
            font-weight: 700 !important;
          }

          .session-host-text {
            color: #0369a1 !important;
          }

          .btn-sftp-hover-action {
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }
        }

        &.active {
          .session-title {
            color: #1e70bf;
            font-weight: 600;
          }
        }
      }
      .session-title {
        font-size: 12px;
        font-weight: 500;
        color: #1e293b;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .session-host-text {
        font-size: 11px;
        color: #64748b;
        white-space: nowrap;
        margin-left: 6px;
        flex-shrink: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .badge-proto-tag {
        font-size: 10px;
        color: #64748b;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        border-radius: 3px;
        padding: 0 4px;
        line-height: 14px;
        flex-shrink: 0;
      }
      .session-type-icon {
        font-size: 11px !important;
        width: 14px !important;
        text-align: center;
        display: inline-block !important;
        line-height: 1 !important;
        flex-shrink: 0;
      }
      .btn-sftp-hover-action {
        display: inline-flex !important;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        width: 18px;
        height: 18px;
        min-width: 18px;
        max-width: 18px;
        min-height: 18px;
        max-height: 18px;
        border-radius: 3px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #1e70bf;
        padding: 0;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin-left: auto !important;
        flex-shrink: 0;
        transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;

        &:hover {
          background: #1e70bf;
          color: #ffffff;
          border-color: #1e70bf;
        }

        svg {
          width: 11px !important;
          height: 11px !important;
        }
      }
      .tree-session-row:hover .btn-sftp-hover-action,
      .tree-session-row.selected .btn-sftp-hover-action {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
      .session-context-menu {
        position: fixed;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        padding: 4px 0;
        min-width: 150px;
        z-index: 70000;
        font-size: 12px;
      }
      .menu-item {
        padding: 6px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #334155;
        cursor: pointer;
        transition: background 0.1s ease;
      }
      .menu-item:hover {
        background: #eff6ff;
        color: #1e40af;
      }
      .menu-item.text-danger {
        color: #dc2626;
      }
      .menu-item.text-danger:hover {
        background: #fef2f2;
        color: #dc2626;
      }
      .menu-icon {
        font-size: 13px;
        width: 16px;
      }
      .menu-separator {
        height: 1px;
        background: #e2e8f0;
        margin: 3px 0;
      }
      .active-session-item,
      .pair-item {
        background: #ffffff;
        border: 1px solid #d0d4dc;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .active-session-item:hover,
      .pair-item:hover {
        background: #f0f2f5;
      }
      .active-session-item.active {
        border-color: #d6334a;
        background: rgba(214, 51, 74, 0.12);
      }
    `,
  ],
})
export class WorkbenchDrawerComponent implements OnInit, OnDestroy {
  @Input() drawerWidth: number = 300
  @Input() activeTab: ActivityTab = 'sessions'
  @Input() activeTerminalTab: any
  @Input() activeProfile: any
  @Input() availableSessions: any[] = []
  @Output() closeDrawer = new EventEmitter<void>()
  @Output() selectSession = new EventEmitter<any>()
  @Output() connectProfile = new EventEmitter<any>()
  @Output() applyDirectoryPair = new EventEmitter<DirectoryPair>()

  sessionFilter = ''
  recentExpanded = true
  savedExpanded = true
  importedExpanded = true
  builtinExpanded = false
  selectedProfile: any = null
  savedProfiles: any[] = []
  recentProfileIds: string[] = []
  showSessionLogDialog = false

  expandedFolderPaths: Set<string> = new Set<string>()
  private initializedFolders = false

  showContextMenu = false
  showFolderContextMenu = false
  contextMenuPos = { x: 0, y: 0 }
  contextMenuProfile: any = null
  contextMenuFolderName: string = ''

  private subs: Subscription[] = []

  constructor(
    private config: ConfigService,
    private notifications: NotificationsService,
    @Optional() private profilesService?: ProfilesService,
    @Optional() private dialogService?: WorkbenchDialogService,
    @Optional() private stateService?: WorkbenchSessionStateService,
    @Optional() private app?: AppService
  ) {}

  ngOnInit(): void {
    try {
      const stored = localStorage.getItem('tabby_workbench_recent_ids')
      if (stored) {
        this.recentProfileIds = JSON.parse(stored)
      }
    } catch {}
    this.applyThemeToDOM(this.frameworkTheme)
    this.applyTabSettingsToDOM()
    this.loadProfiles()
    if (this.config.changed$) {
      this.subs.push(
        this.config.changed$.subscribe(() => {
          this.loadProfiles()
          this.applyThemeToDOM(this.frameworkTheme)
          this.applyTabSettingsToDOM()
        })
      )
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe())
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.showContextMenu = false
    this.showFolderContextMenu = false
  }

  get title(): string {
    switch (this.activeTab) {
      case 'sessions':
        return '会话管理器'
      case 'commands':
        return '常用命令库'
      case 'active-sessions':
        return '活跃会话'
      case 'settings':
        return '系统设置'
      case 'about':
        return '关于'
      default:
        return '工作区'
    }
  }

  async loadProfiles(): Promise<void> {
    if (this.profilesService) {
      try {
        const profiles = await this.profilesService.getProfiles()
        this.savedProfiles = (profiles || []).filter((p: any) => p.type !== 'workbench')
      } catch (err) {
        console.warn('[Workbench] Error loading profiles', err)
      }
    } else if (this.config.store?.profiles) {
      this.savedProfiles = (this.config.store.profiles || []).filter((p: any) => p.type !== 'workbench')
    }
    for (const p of this.savedProfiles) {
      if (!p.type && p.options?.host) {
        p.type = 'ssh'
      }
    }
    this.invalidateProfileCaches()
    this.ensureFoldersInitialized()
  }

  get totalProfilesCount(): number {
    return this.savedProfiles.length
  }

  isImportedProfile(p: any): boolean {
    if (!p) return false
    if (p.isImported || p.__imported) return true
    if (typeof p.id === 'string' && (p.id.startsWith('ssh:config:') || p.id.startsWith('imported:'))) return true
    if (typeof p.group === 'string' && (p.group.toLowerCase().includes('imported') || p.group.includes('导入'))) return true
    return false
  }

  isBuiltinProfile(p: any): boolean {
    if (!p) return false
    if (p.isBuiltin || p.isTemplate) return true
    if (p.type === 'local' || (typeof p.id === 'string' && p.id.startsWith('local:'))) return true
    if (typeof p.group === 'string' && (p.group.toLowerCase().includes('built-in') || p.group.toLowerCase().includes('builtin') || p.group.includes('内置'))) return true
    return false
  }

  isSavedProfile(p: any): boolean {
    return !this.isImportedProfile(p) && !this.isBuiltinProfile(p)
  }

  get recentProfilesList(): any[] {
    const q = this.sessionFilter.trim()
    let list: any[] = []
    if (this.recentProfileIds.length > 0) {
      const map = new Map(this.savedProfiles.map(p => [p.id, p]))
      for (const id of this.recentProfileIds) {
        if (map.has(id)) {
          list.push(map.get(id))
        }
      }
    }
    if (list.length === 0) {
      list = this.savedProfilesList.slice(0, 4)
    }
    if (!q) return list
    return list.filter(p => matchProfile(p, q))
  }

  addRecentProfile(id: string): void {
    if (!id) return
    this.recentProfileIds = [id, ...this.recentProfileIds.filter(i => i !== id)].slice(0, 8)
    try {
      localStorage.setItem('tabby_workbench_recent_ids', JSON.stringify(this.recentProfileIds))
    } catch {}
  }

  // Cache & Memoization fields to avoid recreating objects/arrays on change detection
  private _cachedFilterQuery = ''
  private _cachedRawProfilesRef: any[] | null = null
  private _cachedRawProfilesLength = 0
  private _cachedSavedProfilesList: any[] | null = null
  private _cachedImportedProfilesList: any[] | null = null
  private _cachedBuiltinProfilesList: any[] | null = null

  private _cachedSavedFilteredData: { groups: ProfileFolderGroup[], ungrouped: any[] } | null = null
  private _cachedImportedFilteredData: { groups: ProfileFolderGroup[], ungrouped: any[] } | null = null
  private _cachedBuiltinFilteredData: { groups: ProfileFolderGroup[], ungrouped: any[] } | null = null

  invalidateProfileCaches(): void {
    this._cachedRawProfilesRef = null
    this._cachedRawProfilesLength = 0
    this._cachedSavedProfilesList = null
    this._cachedImportedProfilesList = null
    this._cachedBuiltinProfilesList = null
    this._cachedSavedFilteredData = null
    this._cachedImportedFilteredData = null
    this._cachedBuiltinFilteredData = null
  }

  trackByGroupName = (index: number, group: ProfileFolderGroup): string => {
    return group ? group.name : String(index)
  }

  trackByProfileId = (index: number, p: any): string => {
    return p ? (p.id || p.name || String(index)) : String(index)
  }

  get savedProfilesList(): any[] {
    if (
      this._cachedSavedProfilesList &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedSavedProfilesList
    }
    this._cachedRawProfilesRef = this.savedProfiles
    this._cachedRawProfilesLength = this.savedProfiles.length
    this._cachedSavedProfilesList = this.savedProfiles.filter(p => this.isSavedProfile(p))
    return this._cachedSavedProfilesList
  }

  get importedProfilesList(): any[] {
    if (
      this._cachedImportedProfilesList &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedImportedProfilesList
    }
    this._cachedRawProfilesRef = this.savedProfiles
    this._cachedRawProfilesLength = this.savedProfiles.length
    this._cachedImportedProfilesList = this.savedProfiles.filter(p => this.isImportedProfile(p))
    return this._cachedImportedProfilesList
  }

  get builtinProfilesList(): any[] {
    if (
      this._cachedBuiltinProfilesList &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedBuiltinProfilesList
    }
    this._cachedRawProfilesRef = this.savedProfiles
    this._cachedRawProfilesLength = this.savedProfiles.length
    this._cachedBuiltinProfilesList = this.savedProfiles.filter(p => this.isBuiltinProfile(p))
    return this._cachedBuiltinProfilesList
  }

  isFolderExpanded(groupName: string): boolean {
    this.ensureFoldersInitialized()
    return this.expandedFolderPaths.has(groupName)
  }

  toggleFolder(groupName: string): void {
    this.ensureFoldersInitialized()
    if (this.expandedFolderPaths.has(groupName)) {
      this.expandedFolderPaths.delete(groupName)
    } else {
      this.expandedFolderPaths.add(groupName)
    }
  }

  private ensureFoldersInitialized(): void {
    if (!this.initializedFolders && this.savedProfiles.length > 0) {
      this.initializedFolders = true
      for (const p of this.savedProfiles) {
        if (p.group) {
          this.expandedFolderPaths.add(p.group)
        }
      }
    }
  }

  toggleFolderGroupExpand(): void {
    this.ensureFoldersInitialized()
    const anyFolderOpen = this.expandedFolderPaths.size > 0
    if (anyFolderOpen || this.savedExpanded) {
      this.expandedFolderPaths.clear()
      this.savedExpanded = false
      this.importedExpanded = false
      this.builtinExpanded = false
    } else {
      for (const p of this.savedProfiles) {
        if (p.group) {
          this.expandedFolderPaths.add(p.group)
        }
      }
      this.savedExpanded = true
      this.importedExpanded = true
      this.builtinExpanded = true
    }
  }

  filterProfiles(profiles: any[]): { groups: ProfileFolderGroup[], ungrouped: any[] } {
    const q = this.sessionFilter.trim()
    const groupMap = new Map<string, any[]>()
    const ungrouped: any[] = []

    for (const p of profiles) {
      if (p.group) {
        if (!groupMap.has(p.group)) groupMap.set(p.group, [])
        groupMap.get(p.group)!.push(p)
      } else {
        ungrouped.push(p)
      }
    }

    const groups: ProfileFolderGroup[] = []
    for (const [name, list] of groupMap.entries()) {
      const filtered = q
        ? list.filter(p => matchProfile(p, q) || name.toLowerCase().includes(q.toLowerCase()))
        : list

      if (filtered.length > 0) {
        groups.push({
          name,
          profiles: filtered,
          expanded: this.isFolderExpanded(name),
        })
      }
    }

    const filteredUngrouped = q
      ? ungrouped.filter(p => matchProfile(p, q))
      : ungrouped

    return { groups, ungrouped: filteredUngrouped }
  }

  get savedFilteredData(): { groups: ProfileFolderGroup[], ungrouped: any[] } {
    const q = this.sessionFilter.trim()
    const list = this.savedProfilesList
    if (
      this._cachedSavedFilteredData &&
      this._cachedFilterQuery === q &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedSavedFilteredData
    }
    this._cachedFilterQuery = q
    this._cachedSavedFilteredData = this.filterProfiles(list)
    return this._cachedSavedFilteredData
  }

  get importedFilteredData(): { groups: ProfileFolderGroup[], ungrouped: any[] } {
    const q = this.sessionFilter.trim()
    const list = this.importedProfilesList
    if (
      this._cachedImportedFilteredData &&
      this._cachedFilterQuery === q &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedImportedFilteredData
    }
    this._cachedImportedFilteredData = this.filterProfiles(list)
    return this._cachedImportedFilteredData
  }

  get builtinFilteredData(): { groups: ProfileFolderGroup[], ungrouped: any[] } {
    const q = this.sessionFilter.trim()
    const list = this.builtinProfilesList
    if (
      this._cachedBuiltinFilteredData &&
      this._cachedFilterQuery === q &&
      this._cachedRawProfilesRef === this.savedProfiles &&
      this._cachedRawProfilesLength === this.savedProfiles.length
    ) {
      return this._cachedBuiltinFilteredData
    }
    this._cachedBuiltinFilteredData = this.filterProfiles(list)
    return this._cachedBuiltinFilteredData
  }

  get filteredGroups(): ProfileFolderGroup[] {
    return this.filterProfiles(this.savedProfiles).groups
  }

  get filteredUngroupedProfiles(): any[] {
    return this.filterProfiles(this.savedProfiles).ungrouped
  }

  onSelectProfile(p: any, event?: MouseEvent): void {
    if (p && !p.type && p.options?.host) {
      p.type = 'ssh'
    }
    this.selectedProfile = p
    if (event && event.currentTarget) {
      try {
        (event.currentTarget as HTMLElement).focus()
      } catch {}
    }
  }

  onConnectProfile(p: any): void {
    if (p) {
      if (!p.type && p.options?.host) {
        p.type = 'ssh'
      }
      if (p.id) {
        this.addRecentProfile(p.id)
      }
    }
    this.selectedProfile = p
    this.connectProfile.emit(p)
  }

  onRowKeyDown(event: KeyboardEvent, p: any): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.altKey) {
        this.openSelectedProfileOptions()
      } else if (event.shiftKey) {
        this.onOpenSftp(p, event as any)
      } else {
        this.onConnectProfile(p)
      }
    }
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.onSearchEnter(event.shiftKey)
    }
  }

  onSearchEnter(openSftp = false): void {
    const q = this.sessionFilter.trim()
    if (!q) return
    const saved = this.savedFilteredData
    const firstSaved = (saved.groups[0]?.profiles[0]) || saved.ungrouped[0]
    if (firstSaved) {
      if (openSftp) {
        this.onOpenSftp(firstSaved)
      } else {
        this.onConnectProfile(firstSaved)
      }
      return
    }
    const imported = this.importedFilteredData
    const firstImported = (imported.groups[0]?.profiles[0]) || imported.ungrouped[0]
    if (firstImported) {
      if (openSftp) {
        this.onOpenSftp(firstImported)
      } else {
        this.onConnectProfile(firstImported)
      }
      return
    }
    const { user, host, port } = parseConnectionTarget(q)
    if (host) {
      const profile: any = {
        name: q,
        type: 'ssh',
        options: {
          host,
          port: port || 22,
          ...(user ? { user } : {}),
          ...(openSftp ? { __autoOpenSftpFull: true } : {}),
        },
        ...(openSftp ? { __autoOpenSftpFull: true } : {}),
      }
      if (openSftp) {
        this.onOpenSftp(profile)
      } else {
        this.onConnectProfile(profile)
      }
    }
  }

  connectSelected(): void {
    if (this.selectedProfile) {
      this.connectProfile.emit(this.selectedProfile)
    }
  }

  async createNewSession(): Promise<void> {
    if (this.dialogService) {
      this.dialogService.openNewSession()
    } else if (this.profilesService) {
      try {
        const p = await this.profilesService.showProfileSelector()
        if (p) {
          this.loadProfiles()
          this.onConnectProfile(p)
        }
      } catch (err) {
        console.warn('[Workbench] Error showing profile selector', err)
      }
    }
  }

  createNewFolder(): void {
    const folderName = window.prompt ? window.prompt('请输入新建目录分组名称:') : ''
    if (!folderName || !folderName.trim()) return
    const trimmed = folderName.trim()
    this.expandedFolderPaths.add(trimmed)
    if (this.dialogService) {
      this.dialogService.openNewSession({ group: trimmed })
    }
  }

  isProfileActive(profile: any): boolean {
    if (!profile) return false
    if (this.activeProfile && this.activeProfile.id === profile.id) return true
    if (
      this.activeTerminalTab?.profile &&
      (this.activeTerminalTab.profile.id === profile.id ||
        (this.activeTerminalTab.profile.options?.host &&
          this.activeTerminalTab.profile.options?.host === profile.options?.host))
    ) {
      return true
    }
    return false
  }

  getProfileTooltip(p: any): string {
    const user = p.options?.user || 'user'
    const host = p.options?.host || 'localhost'
    const port = p.options?.port || 22
    return `${p.name} (${user}@${host}:${port})`
  }

  get frameworkTheme(): FrameworkTheme {
    return this.config.store?.secureWorkbench?.frameworkTheme || 'securecrt'
  }

  set frameworkTheme(val: FrameworkTheme) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.frameworkTheme = val
    this.applyThemeToDOM(val)
  }

  applyThemeToDOM(theme: string): void {
    if (typeof document !== 'undefined' && document?.body) {
      document.body.setAttribute('data-framework-theme', theme || 'securecrt')
    }
  }

  get showBuiltinSessions(): boolean {
    return !!this.config.store?.secureWorkbench?.showBuiltinSessions
  }

  set showBuiltinSessions(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.showBuiltinSessions = val
    this.updateSettings()
  }

  get showImportedSessions(): boolean {
    return this.config.store?.secureWorkbench?.showImportedSessions ?? true
  }

  set showImportedSessions(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.showImportedSessions = val
    this.updateSettings()
  }

  get hideSavedRootWhenSole(): boolean {
    return !!this.config.store?.secureWorkbench?.hideSavedRootWhenSole
  }

  set hideSavedRootWhenSole(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.hideSavedRootWhenSole = val
    this.updateSettings()
  }

  get isOnlySavedRoot(): boolean {
    const hasImported = this.showImportedSessions && this.importedProfilesList.length > 0
    const hasBuiltin = this.showBuiltinSessions && this.builtinProfilesList.length > 0
    return !hasImported && !hasBuiltin
  }

  get shouldHideSavedRoot(): boolean {
    return this.hideSavedRootWhenSole && this.isOnlySavedRoot
  }

  get directoryPairs(): DirectoryPair[] {
    return this.config.store?.secureWorkbench?.directoryPairs || []
  }

  get hideNativeSFTP(): boolean {
    return !!this.config.store?.secureWorkbench?.hideNativeSFTPButton
  }

  set hideNativeSFTP(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.hideNativeSFTPButton = val
  }

  get dockHeight(): number {
    return this.config.store?.secureWorkbench?.dockHeight || 140
  }

  set dockHeight(val: number) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.dockHeight = Math.max(80, Math.min(800, Number(val) || 140))
  }

  get showTabIndices(): boolean {
    return !!this.config.store?.secureWorkbench?.showTabIndices
  }

  set showTabIndices(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.showTabIndices = val
    this.applyTabSettingsToDOM()
  }

  get showTabCloseButton(): boolean {
    return this.config.store?.secureWorkbench?.showTabCloseButton ?? true
  }

  set showTabCloseButton(val: boolean) {
    if (!this.config.store.secureWorkbench) {
      this.config.store.secureWorkbench = { ...DEFAULT_WORKBENCH_CONFIG }
    }
    this.config.store.secureWorkbench.showTabCloseButton = val
    this.applyTabSettingsToDOM()
  }

  applyTabSettingsToDOM(): void {
    if (typeof document !== 'undefined' && document?.body) {
      document.body.setAttribute('data-hide-tab-indices', (!this.showTabIndices).toString())
      document.body.setAttribute('data-hide-tab-close', (!this.showTabCloseButton).toString())
    }
  }

  updateSettings(): void {
    this.applyTabSettingsToDOM()
    this.config.save()
  }

  getProfileTypeBadge(p: any): string | null {
    if (!p) return null
    const type = (p.type || '').toUpperCase()
    if (type.includes('SERIAL')) return 'SERIAL'
    if (type.includes('TELNET')) return 'TELNET'
    if (type.includes('LOCAL')) return 'LOCAL'
    const port = p.options?.port
    if (port && port != 22) {
      return `:${port}`
    }
    return null
  }

  getProfileIconClass(p: any): string {
    if (!p) return 'fas fa-terminal'
    if (p.icon) {
      const icon = String(p.icon).trim()
      if (icon.startsWith('fas ') || icon.startsWith('far ') || icon.startsWith('fab ')) {
        return icon
      }
      if (icon.startsWith('fa-')) {
        return `fas ${icon}`
      }
      return `fas fa-${icon}`
    }
    const t = (p.type || '').toLowerCase()
    if (t === 'ssh') return 'fas fa-desktop'
    if (t.includes('serial')) return 'fas fa-microchip'
    if (t.includes('telnet')) return 'fas fa-sitemap'
    if (t.includes('local')) return 'fas fa-terminal'
    if (p.options?.host) return 'fas fa-desktop'
    return 'fas fa-terminal'
  }

  getProfileIconColor(p: any): string {
    if (!p) return '#64748b'
    if (p.color) return p.color
    const t = (p.type || '').toLowerCase()
    if (t === 'ssh' || p.options?.host) return '#2563eb'
    if (t.includes('serial')) return '#d97706'
    if (t.includes('telnet')) return '#db2777'
    if (t.includes('local')) return '#7c3aed'
    return '#64748b'
  }

  isSshProfile(p: any): boolean {
    if (!p) return false
    const t = (p.type || '').toLowerCase()
    return t === 'ssh' || (!t && !!p.options?.host)
  }

  onOpenSftp(p: any, event?: MouseEvent): void {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.openSftpForProfile(p)
  }

  async openSftpForProfile(p: any): Promise<void> {
    if (!p) return
    if (!p.type && p.options?.host) {
      p.type = 'ssh'
    }
    const allTabs = this.collectLeafTabs(this.app?.tabs || [])
    const existingTab = allTabs.find(
      (t: any) =>
        t.profile &&
        (t.profile.id === p.id ||
          (t.profile.options?.host && t.profile.options.host === p.options?.host))
    )
    if (existingTab) {
      if (this.app) {
        this.app.selectTab(existingTab)
      }
      if (typeof (existingTab as any).__openSftpFull === 'function') {
        ;(existingTab as any).__openSftpFull()
      } else if (typeof (existingTab as any).__openSftpRight === 'function') {
        ;(existingTab as any).__openSftpRight()
      } else {
        ;(existingTab as any).__autoOpenSftpFull = true
      }
      return
    }

    if (this.profilesService) {
      try {
        ;(p as any).__autoOpenSftpFull = true
        const tab = await this.profilesService.openNewTabForProfile(p)
        if (tab) {
          ;(tab as any).__autoOpenSftpFull = true
          if (typeof (tab as any).__openSftpFull === 'function') {
            ;(tab as any).__openSftpFull()
          } else if (typeof (tab as any).__openSftpRight === 'function') {
            ;(tab as any).__openSftpRight()
          }
        }
      } catch (err) {
        console.warn('[Workbench] Error opening profile with SFTP', err)
      }
    }
  }

  private collectLeafTabs(tabs: any[]): any[] {
    const res: any[] = []
    for (const t of tabs) {
      if (t && Array.isArray(t.children)) {
        res.push(...this.collectLeafTabs(t.children))
      } else if (t) {
        res.push(t)
      }
    }
    return res
  }

  getProfilePrimaryName(p: any): string {
    if (!p) return '未命名会话'
    const isSerial = (p.type || '').toLowerCase().includes('serial')
    if (isSerial) {
      const port = p.options?.port || p.options?.device || ''
      const shortPort = port ? port.replace('/dev/', '') : ''
      const name = p.name || ''
      if (shortPort && (!name || name === '串口' || name === 'Serial')) {
        return `串口 (${shortPort})`
      }
    }
    const host = p.options?.host
    if (p.name && p.name.trim() && p.name !== host) {
      return p.name
    }
    return host || p.name || '未命名会话'
  }

  getProfileDisplayName(p: any): string {
    return this.getProfilePrimaryName(p)
  }

  onSelectCategory(type: any, groupName?: string): void {
    if (this.stateService) {
      this.stateService.setFilter(type, groupName)
    }
  }

  getProfileSecondaryText(p: any): string {
    if (!p) return ''
    const isSerial = (p.type || '').toLowerCase().includes('serial')
    if (isSerial) {
      return `${p.options?.baudrate || 115200} baud`
    }
    const host = p.options?.host
    const user = p.options?.user

    // If profile has a custom name different from host, show user@host or host
    if (p.name && p.name.trim() && p.name !== host && host) {
      return user ? `${user}@${host}` : host
    }

    // If name is the host, show user if set
    if (user) {
      return user
    }

    if (p.options?.command) {
      return p.options.command
    }
    return ''
  }

  getProfileSubtitle(p: any): string {
    return this.getProfileSecondaryText(p)
  }

  getGroupDisplayName(name: string): string {
    if (!name) return '默认分组'
    if (name.toLowerCase().includes('imported from') && name.toLowerCase().includes('.ssh/config')) {
      return 'SSH 配置导入'
    }
    return name
  }

  openSelectedProfileOptions(): void {
    if (this.selectedProfile && this.dialogService) {
      this.dialogService.openNewSession(this.selectedProfile)
    } else if (this.selectedProfile) {
      this.showSessionLogDialog = true
    }
  }

  onProfileContextMenu(p: any, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.selectedProfile = p
    this.contextMenuProfile = p
    this.contextMenuPos = { x: event.clientX, y: event.clientY }
    this.showFolderContextMenu = false
    this.showContextMenu = true
  }

  onFolderContextMenu(groupName: string, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.contextMenuFolderName = groupName
    this.contextMenuPos = { x: event.clientX, y: event.clientY }
    this.showContextMenu = false
    this.showFolderContextMenu = true
  }

  onFolderMenuNewSession(): void {
    this.showFolderContextMenu = false
    if (this.dialogService) {
      this.dialogService.openNewSession({ group: this.contextMenuFolderName })
    }
  }

  onFolderMenuRename(): void {
    this.showFolderContextMenu = false
    const oldName = this.contextMenuFolderName
    const newName = window.prompt ? window.prompt(`重命名目录 "${oldName}" 为:`, oldName) : null
    if (!newName || !newName.trim() || newName === oldName) return
    const trimmed = newName.trim()

    for (const p of this.savedProfiles) {
      if (p.group === oldName) {
        p.group = trimmed
      }
    }
    if (this.config.store.profiles) {
      for (const p of this.config.store.profiles) {
        if (p.group === oldName) {
          p.group = trimmed
        }
      }
      this.config.save()
    }
    this.expandedFolderPaths.delete(oldName)
    this.expandedFolderPaths.add(trimmed)
    this.notifications?.info(`已重命名目录为: ${trimmed}`)
  }

  onFolderMenuDelete(): void {
    this.showFolderContextMenu = false
    const folderName = this.contextMenuFolderName
    const ok = window.confirm ? window.confirm(`确定删除目录 "${folderName}" 及目录下的会话吗？`) : true
    if (!ok) return

    this.savedProfiles = this.savedProfiles.filter((p: any) => p.group !== folderName)
    if (this.config.store.profiles) {
      this.config.store.profiles = this.config.store.profiles.filter((p: any) => p.group !== folderName)
      this.config.save()
    }
    this.expandedFolderPaths.delete(folderName)
    this.notifications?.info(`已删除目录: ${folderName}`)
  }

  onMenuConnect(): void {
    this.showContextMenu = false
    if (this.contextMenuProfile) {
      this.onConnectProfile(this.contextMenuProfile)
    }
  }

  async onMenuConnectNewTab(): Promise<void> {
    this.showContextMenu = false
    if (!this.contextMenuProfile || !this.profilesService) return
    try {
      await this.profilesService.openNewTabForProfile(this.contextMenuProfile)
    } catch (err) {
      console.warn('[Workbench] Error opening new tab for profile', err)
    }
  }

  onMenuSftp(): void {
    this.showContextMenu = false
    if (this.contextMenuProfile) {
      this.openSftpForProfile(this.contextMenuProfile)
    }
  }

  onMenuEdit(): void {
    this.showContextMenu = false
    if (this.contextMenuProfile && this.dialogService) {
      this.dialogService.openNewSession(this.contextMenuProfile)
    }
  }

  onMenuDuplicate(): void {
    this.showContextMenu = false
    if (!this.contextMenuProfile) return
    const clone = JSON.parse(JSON.stringify(this.contextMenuProfile))
    clone.id = `workbench:${Date.now()}`
    clone.name = `${clone.name || '会话'} (副本)`
    if (!this.config.store.profiles) this.config.store.profiles = []
    this.config.store.profiles.push(clone)
    this.config.save()
    this.loadProfiles()
    this.notifications?.info(`已创建副本: ${clone.name}`)
  }

  onMenuDelete(): void {
    this.showContextMenu = false
    if (!this.contextMenuProfile) return
    const p = this.contextMenuProfile
    this.savedProfiles = this.savedProfiles.filter((x) => x.id !== p.id)
    if (this.config.store.profiles) {
      this.config.store.profiles = this.config.store.profiles.filter((x: any) => x.id !== p.id)
      this.config.save()
    }
    if (this.selectedProfile?.id === p.id) {
      this.selectedProfile = null
    }
    this.notifications?.info(`已删除会话: ${p.name || p.options?.host}`)
  }

  editSelectedProfile(): void {
    this.openSelectedProfileOptions()
  }

  deleteSelectedProfile(): void {
    if (!this.selectedProfile) return
    this.savedProfiles = this.savedProfiles.filter((p) => p.id !== this.selectedProfile.id)
    this.selectedProfile = null
    this.notifications?.info('会话已删除。')
  }
}
