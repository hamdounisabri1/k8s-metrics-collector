import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { PricingService } from 'src/app/core/services/Api/pricing.service';
import { LoadingService } from 'src/app/core/services/loading.service';
import {
  PricesResponse,
  PriceKey,
  UpdatePriceRequest,
  BulkUpdatePricesRequest,
  PriceHistoryEntry,
} from 'src/app/models/metrics.model';

@Component({
  selector: 'app-pricing',
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.css'],
})
export class PricingComponent implements OnInit, OnDestroy {
  Math = Math;

  // ═══════════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════════
  private destroy$ = new Subject<void>();

  // Loading & Health
  loading$ = this.loadingService.isLoading();

  // Current Prices
  prices: PricesResponse | null = null;
  pricesLoaded = false;

  // Individual Price Update
  selectedPriceKey: PriceKey | null = null;
  updatePriceValue: number | null = null;
  updatePriceReason: string = '';
  showUpdatePriceModal = false;

  // Bulk Update
  bulkUpdateValues = {
    cpu_core_price_per_hour: null as number | null,
    ram_gb_price_per_hour: null as number | null,
    storage_gb_price_per_hour: null as number | null,
  };
  bulkUpdateReason: string = '';
  showBulkUpdateModal = false;

  // Pricing History
  priceHistory: PriceHistoryEntry[] = [];
  priceHistoryFiltered: PriceHistoryEntry[] = [];
  historyKeyFilter: PriceKey | null = null;
  historySort = { field: 'changed_at', direction: 'desc' as 'asc' | 'desc' };
  historyPageSize = 10;
  historyCurrentPage = 1;
  historyTotalPages = 1;
  historyPagedData: PriceHistoryEntry[] = [];

  // Reset Confirmation
  showResetConfirmation = false;

  // Toast Notifications
  showToast = false;
  toastMessage = '';
  toastType: 'success' | 'error' | 'info' = 'info';

  // Price Labels
  priceLabels: Record<PriceKey, string> = {
    cpu_core_price_per_hour: 'CPU Core Price',
    ram_gb_price_per_hour: 'RAM GB Price',
    storage_gb_price_per_hour: 'Storage GB Price',
  };

  priceIcons: Record<PriceKey, string> = {
    cpu_core_price_per_hour: 'fa-microchip',
    ram_gb_price_per_hour: 'fa-memory',
    storage_gb_price_per_hour: 'fa-database',
  };

  priceColors: Record<PriceKey, string> = {
    cpu_core_price_per_hour: 'cpu',
    ram_gb_price_per_hour: 'ram',
    storage_gb_price_per_hour: 'storage',
  };

  constructor(
    private pricingService: PricingService,
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
   * Fetch all pricing data
   */
  fetchAllData(): void {
    this.loadingService.show();

    // Fetch Current Prices
    this.pricingService
      .getPrices()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.prices = data;
          this.pricesLoaded = true;
          this.loadingService.hide();
        },
        error: (err) => {
          console.error('Error fetching prices:', err);
          this.showErrorToast('Failed to load pricing data');
          this.loadingService.hide();
        },
      });

    // Fetch Pricing History
    this.pricingService
      .getHistory(undefined, 100)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.priceHistory = data || [];
          this.filterHistory();
        },
        error: (err) => {
          console.error('Error fetching pricing history:', err);
          this.priceHistory = [];
        },
      });
  }

  /**
   * Refresh all data
   */
  refreshData(): void {
    this.fetchAllData();
  }

  // ════════════════════════��══════════════════════════════════════
  // Individual Price Update
  // ═══════════════════════════════════════════════════════════════

  /**
   * Open update price modal
   */
  openUpdatePriceModal(key: PriceKey): void {
    this.selectedPriceKey = key;
    this.updatePriceValue = this.prices?.[key] ?? null;
    this.updatePriceReason = '';
    this.showUpdatePriceModal = true;
  }

  /**
   * Close update price modal
   */
  closeUpdatePriceModal(): void {
    this.showUpdatePriceModal = false;
    this.selectedPriceKey = null;
    this.updatePriceValue = null;
    this.updatePriceReason = '';
  }

  /**
   * Submit individual price update
   */
  submitPriceUpdate(): void {
    if (!this.selectedPriceKey || this.updatePriceValue === null) {
      this.showErrorToast('Please enter a valid price value');
      return;
    }

    this.loadingService.show();

    const request: UpdatePriceRequest = {
      value: this.updatePriceValue,
      updated_by: 'dashboard-user',
      reason: this.updatePriceReason || null,
    };

    this.pricingService
      .updatePrice(this.selectedPriceKey, request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          // Update local prices
          if (this.prices) {
            this.prices[this.selectedPriceKey!] = data.value;
          }
          this.showSuccessToast(
            `${this.priceLabels[this.selectedPriceKey!]} updated successfully`
          );
          this.closeUpdatePriceModal();
          this.loadingService.hide();
          this.fetchAllData(); // Refresh to get updated history
        },
        error: (err) => {
          console.error('Error updating price:', err);
          this.showErrorToast('Failed to update price');
          this.loadingService.hide();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // Bulk Price Update
  // ═══════════════════════════════════════════════════════════════

  /**
   * Open bulk update modal
   */
  openBulkUpdateModal(): void {
    this.bulkUpdateValues = {
      cpu_core_price_per_hour: this.prices?.cpu_core_price_per_hour ?? null,
      ram_gb_price_per_hour: this.prices?.ram_gb_price_per_hour ?? null,
      storage_gb_price_per_hour:
        this.prices?.storage_gb_price_per_hour ?? null,
    };
    this.bulkUpdateReason = '';
    this.showBulkUpdateModal = true;
  }

  /**
   * Close bulk update modal
   */
  closeBulkUpdateModal(): void {
    this.showBulkUpdateModal = false;
    this.bulkUpdateValues = {
      cpu_core_price_per_hour: null,
      ram_gb_price_per_hour: null,
      storage_gb_price_per_hour: null,
    };
    this.bulkUpdateReason = '';
  }

  /**
   * Submit bulk price update
   */
  submitBulkUpdate(): void {
    const hasChanges = Object.values(this.bulkUpdateValues).some(
      (v) => v !== null
    );

    if (!hasChanges) {
      this.showErrorToast('Please enter at least one price value');
      return;
    }

    this.loadingService.show();

    const request: BulkUpdatePricesRequest = {
      updated_by: 'dashboard-user',
      reason: this.bulkUpdateReason || null,
    };

    // Only include changed values
    if (this.bulkUpdateValues.cpu_core_price_per_hour !== null) {
      request.cpu_core_price_per_hour =
        this.bulkUpdateValues.cpu_core_price_per_hour;
    }
    if (this.bulkUpdateValues.ram_gb_price_per_hour !== null) {
      request.ram_gb_price_per_hour =
        this.bulkUpdateValues.ram_gb_price_per_hour;
    }
    if (this.bulkUpdateValues.storage_gb_price_per_hour !== null) {
      request.storage_gb_price_per_hour =
        this.bulkUpdateValues.storage_gb_price_per_hour;
    }

    this.pricingService
      .bulkUpdatePrices(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.prices = data.current;
          this.showSuccessToast('Prices updated successfully');
          this.closeBulkUpdateModal();
          this.loadingService.hide();
          this.fetchAllData(); // Refresh to get updated history
        },
        error: (err) => {
          console.error('Error updating prices:', err);
          this.showErrorToast('Failed to update prices');
          this.loadingService.hide();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // Reset Prices
  // ═══════════════════════════════════════════════════════════════

  /**
   * Open reset confirmation modal
   */
  openResetConfirmation(): void {
    this.showResetConfirmation = true;
  }

  /**
   * Close reset confirmation modal
   */
  closeResetConfirmation(): void {
    this.showResetConfirmation = false;
  }

  /**
   * Confirm and execute reset
   */
  confirmReset(): void {
    this.loadingService.show();

    this.pricingService
      .resetPrices('dashboard-user')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.prices = data;
          this.showSuccessToast('Prices reset to defaults successfully');
          this.closeResetConfirmation();
          this.loadingService.hide();
          this.fetchAllData(); // Refresh to get updated history
        },
        error: (err) => {
          console.error('Error resetting prices:', err);
          this.showErrorToast('Failed to reset prices');
          this.loadingService.hide();
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  // Pricing History Filtering & Sorting
  // ═══════════════════════════════════════════════════════════════

  /**
   * Filter history by price key
   */
  filterHistory(): void {
    this.priceHistoryFiltered = this.priceHistory.filter((entry) => {
      if (this.historyKeyFilter) {
        return entry.key === this.historyKeyFilter;
      }
      return true;
    });
    this.historyCurrentPage = 1;
    this.sortHistory();
    this.updateHistoryPagination();
  }

  /**
   * Handle history key filter change
   */
  onHistoryKeyFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.historyKeyFilter = (target.value || null) as PriceKey | null;
    this.filterHistory();
  }

  /**
   * Sort history entries
   */
  sortHistory(field?: string): void {
    if (field) {
      if (this.historySort.field === field) {
        this.historySort.direction =
          this.historySort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        this.historySort.field = field;
        this.historySort.direction = 'asc';
      }
    }

    this.priceHistoryFiltered.sort((a, b) => {
      let aVal: any = a[
        this.historySort.field as keyof PriceHistoryEntry
      ];
      let bVal: any = b[
        this.historySort.field as keyof PriceHistoryEntry
      ];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal as string).toLowerCase();
      }

      if (aVal < bVal) {
        return this.historySort.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return this.historySort.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    this.updateHistoryPagination();
  }

  /**
   * Update history pagination
   */
  updateHistoryPagination(): void {
    this.historyTotalPages = Math.ceil(
      this.priceHistoryFiltered.length / this.historyPageSize
    );

    if (this.historyCurrentPage > this.historyTotalPages) {
      this.historyCurrentPage = Math.max(1, this.historyTotalPages);
    }

    const startIndex = (this.historyCurrentPage - 1) * this.historyPageSize;
    const endIndex = startIndex + this.historyPageSize;
    this.historyPagedData = this.priceHistoryFiltered.slice(
      startIndex,
      endIndex
    );
  }

  /**
   * Go to history page
   */
  goToHistoryPage(page: number): void {
    if (page >= 1 && page <= this.historyTotalPages) {
      this.historyCurrentPage = page;
      this.updateHistoryPagination();
    }
  }

  /**
   * Next history page
   */
  nextHistoryPage(): void {
    if (this.historyCurrentPage < this.historyTotalPages) {
      this.goToHistoryPage(this.historyCurrentPage + 1);
    }
  }

  /**
   * Previous history page
   */
  previousHistoryPage(): void {
    if (this.historyCurrentPage > 1) {
      this.goToHistoryPage(this.historyCurrentPage - 1);
    }
  }

  /**
   * Get history page numbers
   */
  getHistoryPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    let startPage = Math.max(1, this.historyCurrentPage - 2);
    let endPage = Math.min(
      this.historyTotalPages,
      startPage + maxPagesToShow - 1
    );

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // ═══════════════════════════════════════════════════════════════
  // Toast Notifications
  // ═══════════════════════════════════════════════════════════════

  /**
   * Show success toast
   */
  showSuccessToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'success';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  /**
   * Show error toast
   */
  showErrorToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'error';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  /**
   * Show info toast
   */
  showInfoToast(message: string): void {
    this.toastMessage = message;
    this.toastType = 'info';
    this.showToast = true;
    setTimeout(() => {
      this.showToast = false;
    }, 4000);
  }

  // ═══════════════════════════════════════════════════════════════
  // Utility Methods
  // ═══════════════════════════════════════════════════════════════

  /**
   * Format currency with euro symbol
   */
  formatCurrency(value: number | null | undefined): string {
    if (!value && value !== 0) return 'N/A';
    return '€' + value.toFixed(4);
  }

  /**
   * Format number to 4 decimal places for prices
   */
  formatNumber(value: number | null | undefined): string {
    if (!value && value !== 0) return 'N/A';
    return value.toFixed(4);
  }

  /**
   * Format ISO timestamp to readable date
   */
  formatDate(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Get price change indicator (up/down/neutral)
   */
  getPriceChangeIndicator(oldValue: number | null, newValue: number): string {
    if (oldValue === null) return 'new';
    if (newValue > oldValue) return 'up';
    if (newValue < oldValue) return 'down';
    return 'neutral';
  }

  /**
   * Get price change percentage
   */
  getPriceChangePercentage(
    oldValue: number | null,
    newValue: number
  ): number {
    if (oldValue === null || oldValue === 0) return 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }
}