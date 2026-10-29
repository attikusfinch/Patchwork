import type { ChangedFile, ReviewPlanItem } from './types';

const priorityOrder = { validate: 0, normal: 1, low: 2 };
export function reviewOrder(item?: ReviewPlanItem): number | undefined {
  return Number.isInteger(item?.order) && item!.order! > 0 ? item!.order : undefined;
}

// Explicit steps cross priority groups: execution flow and risk are independent.
export function orderReviewFiles(files: ChangedFile[], plan: Record<string, ReviewPlanItem>): ChangedFile[] {
  return [...files].sort((a, b) => {
    const first = reviewOrder(plan[a.path]), second = reviewOrder(plan[b.path]);
    if (first !== undefined || second !== undefined) {
      if (first === undefined) return 1;
      if (second === undefined) return -1;
      if (first !== second) return first - second;
    }
    return priorityOrder[plan[a.path]?.priority ?? 'normal'] - priorityOrder[plan[b.path]?.priority ?? 'normal']
      || a.path.localeCompare(b.path);
  });
}
