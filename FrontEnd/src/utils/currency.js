export function formatPeso(amount) {
  return '₱' + Number(amount || 0).toLocaleString();
}