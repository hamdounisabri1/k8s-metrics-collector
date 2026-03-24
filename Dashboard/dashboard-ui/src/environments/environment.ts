export const environment = {
  production: false,
  apiUrl: (window as any).__env?.apiUrl,
  refreshInterval: 60000,
  defaultRange: 60,
};

