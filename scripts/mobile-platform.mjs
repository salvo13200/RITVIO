/** Keep platform identities and generated web assets separate. */
export function mobilePlatform(value = process.env.RITVIO_MOBILE_PLATFORM) {
  if (value !== undefined && value !== 'android' && value !== 'ios') throw Error('RITVIO_MOBILE_PLATFORM must be android or ios');
  const platform = value ?? 'android';
  return Object.freeze({platform, appId: `it.ritvio.${platform}`, webDir: platform === 'ios' ? 'ios-web-dist' : 'web-dist'});
}
