import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGitDiff } from '../src/features/git/git-diff.ts'
import {
  clampRightSidebarWidth,
  defaultRightSidebarWidth,
  isRightWidget,
  maxRightSidebarWidth,
  minRightSidebarWidth,
  readRightSidebarWidth,
} from '../src/features/right-sidebar/right-sidebar.ts'

test('borne et restaure la largeur de la sidebar droite', () => {
  assert.equal(maxRightSidebarWidth, 720)
  assert.equal(clampRightSidebarWidth(100), minRightSidebarWidth)
  assert.equal(clampRightSidebarWidth(999), maxRightSidebarWidth)
  assert.equal(clampRightSidebarWidth(320.6), 321)
  assert.equal(readRightSidebarWidth(null), defaultRightSidebarWidth)
  assert.equal(readRightSidebarWidth('invalid'), defaultRightSidebarWidth)
  assert.equal(isRightWidget('git'), true)
  assert.equal(isRightWidget('unknown'), false)
})

test('parse un diff unifié sans ses métadonnées Git', () => {
  const lines = parseGitDiff(
    'diff --git a/file.ts b/file.ts\nindex 123..456 100644\n--- a/file.ts\n+++ b/file.ts\n@@ -2,2 +2,3 @@\n keep\n-old\n+new\n+added\n',
  )

  assert.deepEqual(lines, [
    { content: 'keep', kind: 'context', oldLine: 2, newLine: 2 },
    { content: 'old', kind: 'removed', oldLine: 3, newLine: null },
    { content: 'new', kind: 'added', oldLine: null, newLine: 3 },
    { content: 'added', kind: 'added', oldLine: null, newLine: 4 },
  ])
})

test('calcule les lignes inchangées omises entre deux hunks', () => {
  const entries = parseGitDiff(
    '@@ -1,3 +1,2 @@\n same\n-a\n-b\n+b\n@@ -10,2 +10,3 @@\n other\n+c\n',
  )

  assert.deepEqual(entries, [
    { content: 'same', kind: 'context', oldLine: 1, newLine: 1 },
    { content: 'a', kind: 'removed', oldLine: 2, newLine: null },
    { content: 'b', kind: 'removed', oldLine: 3, newLine: null },
    { content: 'b', kind: 'added', oldLine: null, newLine: 2 },
    { count: 6, kind: 'gap' },
    { content: 'other', kind: 'context', oldLine: 10, newLine: 10 },
    { content: 'c', kind: 'added', oldLine: null, newLine: 11 },
  ])
})

test('met en évidence les mots modifiés dans un remplacement d’une ligne', () => {
  const entries = parseGitDiff('@@ -4,1 +4,1 @@\n-const x = 1\n+const x = 2\n')

  assert.deepEqual(entries, [
    {
      content: 'const x = 1',
      kind: 'removed',
      oldLine: 4,
      newLine: null,
      segments: [{ text: 'const x = ', kind: 'shared' }, { text: '1', kind: 'removed' }],
    },
    {
      content: 'const x = 2',
      kind: 'added',
      oldLine: null,
      newLine: 4,
      segments: [{ text: 'const x = ', kind: 'shared' }, { text: '2', kind: 'added' }],
    },
  ])
})
