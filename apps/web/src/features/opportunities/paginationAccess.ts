export const PUBLIC_OPPORTUNITY_PAGE_LIMIT = 3;

export function opportunityPageRequiresLogin(page: number, isAuthenticated: boolean): boolean {
  return !isAuthenticated && page > PUBLIC_OPPORTUNITY_PAGE_LIMIT;
}
