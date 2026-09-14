import { useEffect } from 'react'

const replacements: Array<[string, string]> = [
  ['Project PenPal', 'OutKin'],
  ['Join the beta', 'Join OutKin'],
]

function rebrand(value: string) {
  return replacements.reduce((next, [from, to]) => next.replaceAll(from, to), value)
}

function updateText(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()

  while (node) {
    const value = node.nodeValue
    if (value) {
      const next = rebrand(value)
      if (next !== value) node.nodeValue = next
    }
    node = walker.nextNode()
  }
}

function updateAttributes(root: Node) {
  const elements: Element[] = []
  if (root instanceof Element) elements.push(root)
  if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
    elements.push(...Array.from(root.querySelectorAll('[aria-label], [title], [placeholder]')))
  }

  for (const element of elements) {
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(name)
      if (!value) continue
      const next = rebrand(value)
      if (next !== value) element.setAttribute(name, next)
    }
  }
}

function updateRoot(root: Node) {
  updateText(root)
  updateAttributes(root)
}

export default function OutKinBrandBridge() {
  useEffect(() => {
    updateRoot(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          if (mutation.target.nodeValue) {
            const next = rebrand(mutation.target.nodeValue)
            if (next !== mutation.target.nodeValue) mutation.target.nodeValue = next
          }
          continue
        }

        if (mutation.type === 'attributes') {
          updateAttributes(mutation.target)
          continue
        }

        for (const node of Array.from(mutation.addedNodes)) updateRoot(node)
      }
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'placeholder'],
    })

    return () => observer.disconnect()
  }, [])

  return null
}
