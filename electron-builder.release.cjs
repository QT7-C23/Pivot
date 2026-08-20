const packageJson = require('./package.json')

function requireReleaseVariable(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`External release requires ${name}`)
  return value
}

const base = packageJson.build
const signingMethod = (process.env.PIVOT_SIGNING_METHOD || 'pfx').trim().toLowerCase()
if (!['azure', 'pfx'].includes(signingMethod)) {
  throw new Error('PIVOT_SIGNING_METHOD must be pfx or azure')
}

const azureSignOptions = signingMethod === 'azure'
  ? {
      endpoint: requireReleaseVariable('PIVOT_AZURE_ENDPOINT'),
      codeSigningAccountName: requireReleaseVariable('PIVOT_AZURE_ACCOUNT_NAME'),
      certificateProfileName: requireReleaseVariable('PIVOT_AZURE_CERTIFICATE_PROFILE'),
      publisherName: requireReleaseVariable('PIVOT_AZURE_PUBLISHER_NAME'),
    }
  : undefined

module.exports = {
  ...base,
  forceCodeSigning: true,
  win: {
    ...base.win,
    forceCodeSigning: true,
    icon: 'build/icon.svg',
    signAndEditExecutable: true,
    signExecutable: true,
    ...(azureSignOptions ? { azureSignOptions } : {}),
  },
  publish: [{
    provider: 'github',
    owner: 'QT7-C23',
    repo: 'Pivot',
    channel: 'beta',
    private: false,
    publishAutoUpdate: true,
    releaseType: 'draft',
  }],
}
