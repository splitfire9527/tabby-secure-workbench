import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

export interface CategoryFilter {
  type: 'all' | 'recent' | 'saved' | 'imported' | 'builtin' | 'serial' | 'group'
  groupName?: string
}

@Injectable({ providedIn: 'root' })
export class WorkbenchSessionStateService {
  readonly filter$ = new BehaviorSubject<CategoryFilter>({ type: 'all' })

  get currentFilter(): CategoryFilter {
    return this.filter$.value
  }

  setFilter(type: CategoryFilter['type'], groupName?: string): void {
    this.filter$.next({ type, groupName })
  }
}
