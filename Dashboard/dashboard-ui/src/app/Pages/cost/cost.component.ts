import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { CostService } from 'src/app/core/services/Api/cost.service';
import { LoadingService } from 'src/app/core/services/loading.service';
import {
  CostOverview,
  NodeCost,
  NamespaceCost,
  PodCost,
  PodCostHistoryPoint,
  SimulateQueryParams,
  SimulateResponse,
} from 'src/app/models/metrics.model';

@Component({
  selector: 'app-cost',
  templateUrl: './cost.component.html',
  styleUrls: ['./cost.component.css'],
})
export class CostComponent implements OnInit, OnDestroy {
  Math = Math;

  // ═══════════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════════
  private destroy$ = new Subject<void>();

  // Loading & Health (Observable from service)
  loading$ = this.loadingService.isLoading();

  // Time Range
  rangeMinutes = 60;
  windowMinutes = 5;

  // Overview Data
  overview: CostOverview | null = null;

  // Nodes Cost Data
  nodesCost: NodeCost[] = [];
  nodesCostFiltered: NodeCost[] = [];
  nodeSort = { field: 'node', direction: 'asc' as 'asc' | 'desc' };

  // Namespaces Cost Data
  namespacesCost: NamespaceCost[] = [];
  namespacesCostFiltered: NamespaceCost[] = [];
  namespaceSort = {
    field: 'namespace',
    direction: 'asc' as 'asc' | 'desc',
  };

  // Pods Cost Data
  podsCost: PodCost[] = [];
  podsCostFiltered: PodCost[] = [];
  podSort = { field: 'pod', direction: 'asc' as 'asc' | 'desc' };
  podNamespaceFilter = '';

  // Pagination
  podsPageSize = 8;
  podsCurrentPage = 1;
  podsTotalPages = 1;
  podsPagedData: PodCost[] = [];

  // Top Pods Cost
  topPodsCost: PodCost[] = [];

  // Pod History Data
  selectedPodHistory: PodCostHistoryPoint[] = [];
  selectedPodName: string | null = null;
  selectedPodNamespace: string | null = null;
  showPodHistoryModal = false;

  // Cost Simulator
  showSimulator = false;
  simulatorInputs: SimulateQueryParams = {
    cpu_cores: 1,
    ram_gb: 2,
    storage_gb: 10,
    hours: 24,
  };
  simulatorResult: SimulateResponse | null = null;

  constructor(
    private costService: CostService,
    private loadingService: LoadingService
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // Lifecycle Hooks
  // ═══════════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.fetchAllData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═══════════════════════════════════════════════════════════════
  // Data Fetching
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch all cost dashboard data in parallel
   */
  fetchAllData(): void {
    this.loadingService.show();

    // Fetch Cost Overview
    this.costService
      .getOverview(this.rangeMinutes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.overview = data;
        },
        error: (err) => {
          console.error('Error fetching cost overview:', err);
          this.overview = null;
        },
      });

    // Fetch Nodes Cost
    this.costService
      .getNodes(this.rangeMinutes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.nodesCost = data || [];
          this.sortNodes();
        },
        error: (err) => {
          console.error('Error fetching nodes cost:', err);
          this.nodesCost = [];
        },
      });

    // Fetch Namespaces Cost
    this.costService
      .getNamespaces(this.rangeMinutes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.namespacesCost = data || [];
          this.sortNamespaces();
        },
        error: (err) => {
          console.error('Error fetching namespaces cost:', err);
          this.namespacesCost = [];
        },
      });

    // Fetch Pods Cost
    this.costService
      .getPods(this.rangeMinutes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.podsCost = data || [];
          this.filterPods();
        },
        error: (err) => {
          console.error('Error fetching pods cost:', err);
          this.podsCost = [];
        },
      });

    // Fetch Top Pods Cost
    this.costService
      .getTopPods(10, this.rangeMinutes)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.topPodsCost = data || [];
        },
        error: (err) => {
          console.error('Error fetching top pods cost:', err);
          this.topPodsCost = [];
        },
      });

    this.loadingService.hide();
  }

  /**
   * Update chart range and refresh data
   */
  updateChartRange(range: number): void {
    this.rangeMinutes = range;
    this.fetchAllData();
  }

  // ═══════════════════════════════════════════════════════════════
  // Filtering & Sorting - Pods Cost
  // ═════════════════════��═════════════════════════════════════════

  filterPods(): void {
    this.podsCostFiltered = this.podsCost.filter((pod) => {
      if (this.podNamespaceFilter) {
        return pod.namespace === this.podNamespaceFilter;
      }
      return true;
    });
    this.podsCurrentPage = 1;
    this.sortPods();
    this.updatePodsPagination();
  }

  onNamespaceFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.podNamespaceFilter = target.value;
    this.filterPods();
  }

  sortPods(field?: string): void {
    if (field) {
      if (this.podSort.field === field) {
        this.podSort.direction =
          this.podSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this.podSort.field = field;
        this.podSort.direction = 'asc';
      }
    }

    this.podsCostFiltered.sort((a, b) => {
      let aVal: any = a[this.podSort.field as keyof PodCost];
      let bVal: any = b[this.podSort.field as keyof PodCost];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) {
        return this.podSort.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return this.podSort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    this.updatePodsPagination();
  }

  /**
   * Update pods pagination
   */
  updatePodsPagination(): void {
    this.podsTotalPages = Math.ceil(
      this.podsCostFiltered.length / this.podsPageSize
    );

    if (this.podsCurrentPage > this.podsTotalPages) {
      this.podsCurrentPage = Math.max(1, this.podsTotalPages);
    }

    const startIndex = (this.podsCurrentPage - 1) * this.podsPageSize;
    const endIndex = startIndex + this.podsPageSize;
    this.podsPagedData = this.podsCostFiltered.slice(startIndex, endIndex);
  }

  /**
   * Change pods page
   */
  goToPodsPage(page: number): void {
    if (page >= 1 && page <= this.podsTotalPages) {
      this.podsCurrentPage = page;
      this.updatePodsPagination();
    }
  }

  /**
   * Get array of page numbers for pagination
   */
  getPodsPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    let startPage = Math.max(1, this.podsCurrentPage - 2);
    let endPage = Math.min(this.podsTotalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  /**
   * Next page
   */
  nextPodsPage(): void {
    if (this.podsCurrentPage < this.podsTotalPages) {
      this.goToPodsPage(this.podsCurrentPage + 1);
    }
  }

  /**
   * Previous page
   */
  previousPodsPage(): void {
    if (this.podsCurrentPage > 1) {
      this.goToPodsPage(this.podsCurrentPage - 1);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Filtering & Sorting - Nodes Cost
  // ═══════════════════════════════════════════════════════════════

  sortNodes(field?: string): void {
    if (field) {
      if (this.nodeSort.field === field) {
        this.nodeSort.direction =
          this.nodeSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this.nodeSort.field = field;
        this.nodeSort.direction = 'asc';
      }
    }

    this.nodesCostFiltered = [...this.nodesCost].sort((a, b) => {
      let aVal: any = a[this.nodeSort.field as keyof NodeCost];
      let bVal: any = b[this.nodeSort.field as keyof NodeCost];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) {
        return this.nodeSort.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return this.nodeSort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Filtering & Sorting - Namespaces Cost
  // ═══════════════════════════════════════════════════════════════

  sortNamespaces(field?: string): void {
    if (field) {
      if (this.namespaceSort.field === field) {
        this.namespaceSort.direction =
          this.namespaceSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this.namespaceSort.field = field;
        this.namespaceSort.direction = 'asc';
      }
    }

    this.namespacesCostFiltered = [...this.namespacesCost].sort((a, b) => {
      let aVal: any = a[this.namespaceSort.field as keyof NamespaceCost];
      let bVal: any = b[this.namespaceSort.field as keyof NamespaceCost];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) {
        return this.namespaceSort.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return this.namespaceSort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Pod History
  // ═══════════════════════════════════════════════════════════════

  /**
   * Fetch pod cost history
   */
  fetchPodHistory(pod: PodCost): void {
    this.selectedPodName = pod.pod;
    this.selectedPodNamespace = pod.namespace;
    this.loadingService.show();

    this.costService
      .getPodHistory(
        pod.pod,
        this.rangeMinutes,
        this.windowMinutes,
        pod.namespace
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.selectedPodHistory = data || [];
          this.showPodHistoryModal = true;
          this.loadingService.hide();
        },
        error: (err) => {
          console.error('Error fetching pod history:', err);
          this.selectedPodHistory = [];
          this.loadingService.hide();
        },
      });
  }

  /**
   * Close pod history modal
   */
  closePodHistory(): void {
    this.showPodHistoryModal = false;
    this.selectedPodHistory = [];
    this.selectedPodName = null;
    this.selectedPodNamespace = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Cost Simulator
  // ═══════════════════════════════════════════════════════════════

  /**
   * Toggle simulator visibility
   */
toggleSimulator(): void {
  this.showSimulator = !this.showSimulator;
  if (!this.showSimulator) {
    this.simulatorResult = null;
  }
  
  if (this.showSimulator) {
    setTimeout(() => {
      document.querySelector('app-cost')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 300);
  }
}

  /**
   * Run cost simulation
   */
  runSimulation(): void {
    this.loadingService.show();
    this.costService
      .simulate(this.simulatorInputs)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.simulatorResult = data;
          this.loadingService.hide();
        },
        error: (err) => {
          console.error('Error running simulation:', err);
          this.simulatorResult = null;
          this.loadingService.hide();
        },
      });
  }

  /**
   * Reset simulator form
   */
  resetSimulator(): void {
    this.simulatorInputs = {
      cpu_cores: 1,
      ram_gb: 2,
      storage_gb: 10,
      hours: 24,
    };
    this.simulatorResult = null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Format number to 2 decimal places
   */
  formatNumber(value: number | null | undefined): string {
    if (!value && value !== 0) return 'N/A';
    return value.toFixed(2);
  }

  /**
   * Format currency with euro symbol
   */
  formatCurrency(value: number | null | undefined): string {
    if (!value && value !== 0) return 'N/A';
    return '€' + value.toFixed(2);
  }

  /**
   * Get percentage of total cost
   */
  getPercentageOfTotal(cost: number, total: number): number {
    if (total === 0) return 0;
    return (cost / total) * 100;
  }

  /**
   * Get unique namespaces for filter dropdown
   */
  getUniqueNamespaces(): string[] {
    const namespaces = new Set(this.podsCost.map((p) => p.namespace));
    return Array.from(namespaces).sort();
  }

  /**
   * Refresh all data
   */
  refreshData(): void {
    this.fetchAllData();
  }
}