import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CostComponent } from './Pages/cost/cost.component';
import { MetricsComponent } from './Pages/metrics/metrics.component';
import { UsersComponent } from './Pages/users/users.component';
import { PricingComponent } from './Pages/pricing/pricing.component';


const routes: Routes = [
  // route par défaut
  {
    path: '',
    redirectTo: 'metrics',
    pathMatch: 'full'
  },

  // routes de l'app
  {
    path: 'cost',
    component: CostComponent
  },
  {
    path: 'metrics',
    component: MetricsComponent
  },
  {
    path: 'users',
    component: UsersComponent
  },
  {
    path: 'pricing',
    component: PricingComponent
  }
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
