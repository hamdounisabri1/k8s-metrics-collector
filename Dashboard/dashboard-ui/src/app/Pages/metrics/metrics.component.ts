import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChartOptions } from 'chart.js';
import { Subject, takeUntil } from 'rxjs';
import { MetricsService } from 'src/app/core/services/Api/metrics.service';
import { LoadingService } from 'src/app/core/services/loading.service';
import { HealthResponse, ClusterOverview, NodeMetrics, NamespaceMetrics, PodMetrics, TimeseriesPoint } from 'src/app/models/metrics.model';

@Component({
  selector: 'app-metrics',
  templateUrl: './metrics.component.html',
  styleUrls: ['./metrics.component.css']
})
export class MetricsComponent implements OnInit, OnDestroy {
   Math = Math;


    // Chart Data - Updated for ng2-charts 4.0.1
  cpuChartData: any = null;
  cpuChartOptions: ChartOptions = {};

  ramChartData: any = null;
  ramChartOptions: ChartOptions = {};

  storageChartData: any = null;
  storageChartOptions: ChartOptions = {};

    rangeMinutes = 60;
  windowMinutes = 5;

   // ═══════════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════════
  private destroy$ = new Subject<void>();

  // Loading & Health
  loading$ = this.loadingService.isLoading();
  health: HealthResponse | null = null;

  // Overview Data
  overview: ClusterOverview | null = null;

  // Nodes Data
  nodes: NodeMetrics[] = [];
  nodesFiltered: NodeMetrics[] = [];
  nodeSort = { field: 'node', direction: 'asc' as 'asc' | 'desc' };

  // Namespaces Data
  namespaces: NamespaceMetrics[] = [];
  namespacesFiltered: NamespaceMetrics[] = [];
  namespaceSort = { field: 'namespace', direction: 'asc' as 'asc' | 'desc' };
  selectedNamespace = '';

  // Pods Data
  pods: PodMetrics[] = [];
  podsFiltered: PodMetrics[] = [];
  podSort = { field: 'pod', direction: 'asc' as 'asc' | 'desc' };
  podNamespaceFilter = '';
 // Pagination
  podsPageSize = 8;
  podsCurrentPage = 1;
  podsTotalPages = 1;
  podsPagedData: PodMetrics[] = [];

  // Top Pods
  topPodsByCPU: PodMetrics[] = [];
  topPodsByRAM: PodMetrics[] = [];
  topPodsByStorage: PodMetrics[] = [];

  // Timeseries Data
  timeseriesCPU: TimeseriesPoint[] = [];
  timeseriesRAM: TimeseriesPoint[] = [];
  timeseriesStorage: TimeseriesPoint[] = [];

  // Chart Options
  chartReady = false;
  selectedTimeseriesField: 'cpu_cores' | 'ram_gb' | 'storage_gb' = 'cpu_cores';

  constructor(
    private metricsService: MetricsService,
    private loadingService: LoadingService
  ) {}

  // Chart Configuration Method
  // ═══════════════════════════════════════════════════════════════

  /**
   * Build Chart.js data for ng2-charts 4.0.1 with Chart.js 3.9.1
   */
  buildChartData(data: TimeseriesPoint[], borderColor: string) {
    // Filter out null times and sort by time
    const validData = data
      .filter((p) => p.time !== null)
      .sort(
        (a, b) => new Date(a.time!).getTime() - new Date(b.time!).getTime()
      );

    const labels = validData.map((p) => {
      const date = new Date(p.time!);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    const values = validData.map((p) => p.value);

    return {
      labels: labels,
      datasets: [
        {
          label: 'Value',
          data: values,
          borderColor: borderColor,
          backgroundColor: borderColor + '15',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: borderColor,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          pointHoverBorderWidth: 3,
        },
      ],
    };


  }

  /**
   * Build Chart.js options
   */
  buildChartOptions(label: string): ChartOptions {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 15,
            font: {
              size: 12,
            },
          },
        },
        filler: {
          propagate: true,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: 0.05,
          ticks: {
            font: {
              size: 11,
            },
          },
        },
        x: {
          ticks: {
            font: {
              size: 11,
            },
            maxRotation: 45,
            minRotation: 0,
          },
        },
      },
    } as ChartOptions;
  }

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
   * Fetch all dashboard data in parallel
   */
  fetchAllData(): void {
    this.loadingService.show();

    // Fetch Health
    this.metricsService
      .getHealth()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.health = data;
        },
        error: (err) => {
          console.error('Error fetching health:', err);
          this.health = null;
        },
      });

    // Fetch Overview
    this.metricsService
      .getOverview(60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.overview = data;
        },
        error: (err) => {
          console.error('Error fetching overview:', err);
          this.overview = null;
        },
      });

    // Fetch Nodes
    this.metricsService
      .getNodes(60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.nodes = data || [];
          this.sortNodes();
        },
        error: (err) => {
          console.error('Error fetching nodes:', err);
          this.nodes = [];
        },
      });

    // Fetch Namespaces
    this.metricsService
      .getNamespaces(60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.namespaces = data || [];
          this.sortNamespaces();
        },
        error: (err) => {
          console.error('Error fetching namespaces:', err);
          this.namespaces = [];
        },
      });

    // Fetch Pods
    this.metricsService
      .getPods({ range_minutes: 60 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.pods = data || [];
          this.filterPods();
        },
        error: (err) => {
          console.error('Error fetching pods:', err);
          this.pods = [];
        },
      });

    // Fetch Top Pods by CPU
    this.metricsService
      .getTopPods('cpu_cores', 10, 60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.topPodsByCPU = data || [];
        },
        error: (err) => {
          console.error('Error fetching top pods (CPU):', err);
          this.topPodsByCPU = [];
        },
      });

    // Fetch Top Pods by RAM
    this.metricsService
      .getTopPods('ram_gb', 10, 60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.topPodsByRAM = data || [];
        },
        error: (err) => {
          console.error('Error fetching top pods (RAM):', err);
          this.topPodsByRAM = [];
        },
      });

    // Fetch Top Pods by Storage
    this.metricsService
      .getTopPods('storage_gb', 10, 60)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.topPodsByStorage = data || [];
        },
        error: (err) => {
          console.error('Error fetching top pods (Storage):', err);
          this.topPodsByStorage = [];
        },
      });

      this.fetchCPUTimeseries();
    this.fetchRAMTimeseries();
    this.fetchStorageTimeseries();

    this.loadingService.hide();
  }

    /**
   * Fetch Timeseries for CPU and build chart data
   */
  fetchCPUTimeseries(): void {
    this.metricsService
      .getTimeseries({
        field: 'cpu_cores',
        range_minutes: this.rangeMinutes,
        window_minutes: this.windowMinutes,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.timeseriesCPU = data || [];
          this.cpuChartData = this.buildChartData(
            this.timeseriesCPU,
            '#ef4444'
          );
          this.cpuChartOptions = this.buildChartOptions('CPU Usage (Cores)');
          this.chartReady = true;
        },
        error: (err) => {
          console.error('Error fetching timeseries (CPU):', err);
          this.timeseriesCPU = [];
        },
      });
  }

  /**
   * Fetch Timeseries for RAM and build chart data
   */
  fetchRAMTimeseries(): void {
    this.metricsService
      .getTimeseries({
        field: 'ram_gb',
        range_minutes: this.rangeMinutes,
        window_minutes: this.windowMinutes,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.timeseriesRAM = data || [];
          this.ramChartData = this.buildChartData(
            this.timeseriesRAM,
            '#f59e0b'
          );
          this.ramChartOptions = this.buildChartOptions('RAM Usage (GB)');
        },
        error: (err) => {
          console.error('Error fetching timeseries (RAM):', err);
          this.timeseriesRAM = [];
        },
      });
  }

  /**
   * Fetch Timeseries for Storage and build chart data
   */
  fetchStorageTimeseries(): void {
    this.metricsService
      .getTimeseries({
        field: 'storage_gb',
        range_minutes: this.rangeMinutes,
        window_minutes: this.windowMinutes,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.timeseriesStorage = data || [];
          this.storageChartData = this.buildChartData(
            this.timeseriesStorage,
            '#8b5cf6'
          );
          this.storageChartOptions = this.buildChartOptions(
            'Storage Usage (GB)'
          );
        },
        error: (err) => {
          console.error('Error fetching timeseries (Storage):', err);
          this.timeseriesStorage = [];
        },
      });
  }

    /**
   * Update chart range and refresh data
   */
  updateChartRange(range: number): void {
    this.rangeMinutes = range;
    this.fetchAllData();
  }
  // ═══════════════════════════════════════════════════════════════
  // Filtering & Sorting - Pods
  // ═══════════════════════════════════════════════════════════════

  filterPods(): void {
    this.podsFiltered = this.pods.filter((pod) => {
      if (this.podNamespaceFilter) {
        return pod.namespace === this.podNamespaceFilter;
      }
      return true;
    });
    this.podsCurrentPage = 1; // Reset to first page
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

    this.podsFiltered.sort((a, b) => {
      let aVal: any = a[this.podSort.field as keyof PodMetrics];
      let bVal: any = b[this.podSort.field as keyof PodMetrics];

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
      this.podsFiltered.length / this.podsPageSize
    );

    if (this.podsCurrentPage > this.podsTotalPages) {
      this.podsCurrentPage = Math.max(1, this.podsTotalPages);
    }

    const startIndex = (this.podsCurrentPage - 1) * this.podsPageSize;
    const endIndex = startIndex + this.podsPageSize;
    this.podsPagedData = this.podsFiltered.slice(startIndex, endIndex);
  }

  /**
   * Change pods page
   */
  goToPodsPage(page: number): void {
    if (page >= 1 && page <= this.podsTotalPages) {
      this.podsCurrentPage = page;
      this.updatePodsPagination();
      // Scroll to pods section

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
  // Filtering & Sorting - Nodes
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

    this.nodesFiltered = [...this.nodes].sort((a, b) => {
      let aVal: any = a[this.nodeSort.field as keyof NodeMetrics];
      let bVal: any = b[this.nodeSort.field as keyof NodeMetrics];

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
  // Filtering & Sorting - Namespaces
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

    this.namespacesFiltered = [...this.namespaces].sort((a, b) => {
      let aVal: any = a[this.namespaceSort.field as keyof NamespaceMetrics];
      let bVal: any = b[this.namespaceSort.field as keyof NamespaceMetrics];

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
   * Get status badge color based on health status
   */
  getStatusBadgeClass(status: string): string {
    return status === 'ok' ? 'badge-success' : 'badge-danger';
  }

  /**
   * Get pod count for namespace
   */
  getPodCountByNamespace(namespace: string): number {
    return this.pods.filter((p) => p.namespace === namespace).length;
  }

  /**
   * Get pod count for node
   */
  getPodCountByNode(node: string): number {
    return this.pods.filter((p) => p.node === node).length;
  }

  /**
   * Get unique namespaces for filter dropdown
   */
  getUniqueNamespaces(): string[] {
    const namespaces = new Set(this.pods.map((p) => p.namespace));
    return Array.from(namespaces).sort();
  }

  /**
   * Refresh all data
   */
  refreshData(): void {
    this.fetchAllData();
  }


}
