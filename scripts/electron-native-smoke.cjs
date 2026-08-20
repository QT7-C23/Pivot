const { app } = require('electron')
const { runSqliteNativeSmoke } = require('./sqlite-native-smoke.cjs')

app.whenReady()
  .then(() => {
    runSqliteNativeSmoke('electron')
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
