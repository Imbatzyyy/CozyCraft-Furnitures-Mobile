// Keep only tiny classification results, never decoded images or canvas buffers.
const results = new Map<string, boolean>()
export function readImageAnalysis(source: string) { return results.get(source) }
export function saveImageAnalysis(source: string, value: boolean) {
  if (!source) return
  results.delete(source)
  results.set(source, value)
  if (results.size > 200) results.delete(results.keys().next().value!)
}
