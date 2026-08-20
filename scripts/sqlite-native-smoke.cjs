const { rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')

function runSqliteNativeSmoke(label = 'runtime') {
  const databasePath = path.join(
    tmpdir(),
    `pivot-better-sqlite3-${label}-${process.pid}-${Date.now()}.sqlite`,
  )
  let database

  try {
    const Database = require('better-sqlite3')
    database = new Database(databasePath)
    database.pragma('foreign_keys = ON')
    database.pragma('journal_mode = WAL')
    database.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL);')
    database.exec('CREATE VIRTUAL TABLE session_search USING fts5(session_id UNINDEXED, title, content);')
  } finally {
    database?.close()
    for (const suffix of ['', '-shm', '-wal']) {
      rmSync(`${databasePath}${suffix}`, { force: true })
    }
  }
}

module.exports = { runSqliteNativeSmoke }
