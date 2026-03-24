import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent {
   navItems: NavItem[] = [
    {
      label: 'Metrics',
      route: '/metrics',
      icon: 'fas fa-chart-line'
    },
    {
      label: 'Cost',
      route: '/cost',
      icon: 'fas fa-dollar-sign'
    },
     {
      label: 'Pricing',
      route: '/pricing',
      icon: 'fas fa-tag'
    },
    {
      label: 'Users',
      route: '/users',
      icon: 'fas fa-users'
    }
   
  ];

  constructor(private router: Router) {}

  onLogout(): void {
    // Add your logout logic here
    console.log('Logging out...');
    // Example: Clear authentication token
    localStorage.removeItem('authToken');
    // Redirect to login
    this.router.navigate(['/login']);
  }


}
