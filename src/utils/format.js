export function formatCurrency(amount, currency = 'ARS') {
  const num = amount ?? 0
  const hasDecimals = num % 1 !== 0
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'ARS',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num)
}
