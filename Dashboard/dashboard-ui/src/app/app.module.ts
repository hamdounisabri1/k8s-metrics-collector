import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { apiPrefixInterceptor } from './core/interceptors/api-prefix.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { RouterModule } from '@angular/router';
import { MainLayoutComponent } from './main-layout/main-layout.component';
import { SidebarComponent } from './main-layout/sidebar/sidebar.component';
import { CostComponent } from './Pages/cost/cost.component';
import { MetricsComponent } from './Pages/metrics/metrics.component';
import { UsersComponent } from './Pages/users/users.component';
import { PricingComponent } from './Pages/pricing/pricing.component';
import { MetricsService } from './core/services/Api/metrics.service';
import { LoadingService } from './core/services/loading.service';
import { NgChartsModule } from 'ng2-charts';
import { FormsModule } from '@angular/forms';


@NgModule({
  declarations: [
    AppComponent,
    MainLayoutComponent,
    SidebarComponent,
    CostComponent,
    MetricsComponent,
    UsersComponent,
    PricingComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    CommonModule,
    RouterModule ,
    NgChartsModule,
    FormsModule
],
  providers: [
        provideHttpClient(
      withInterceptors([
        apiPrefixInterceptor,
        loadingInterceptor,
        errorInterceptor,  
      ])
    ),
    MetricsService, LoadingService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
