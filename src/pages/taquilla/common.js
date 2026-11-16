export const formatSol = (n) => `S/ ${Number(n).toFixed(2)}`;
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);
