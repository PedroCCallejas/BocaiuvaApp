export function createSingleFlight() {
  let pending: Promise<void> | null = null;
  return (task: () => Promise<void>): Promise<void> => {
    if (!pending) pending = Promise.resolve().then(task).finally(() => { pending = null; });
    return pending;
  };
}
