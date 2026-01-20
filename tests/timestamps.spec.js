require('./jasmine/reporter')

function getDate() {
  // Use UTC for all event times
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()

  // Helper to get unix timestamp for UTC date
  function getUnixUTC(daysFromNow, hour, minute = 0) {
    const date = new Date(
      Date.UTC(year, month, day + daysFromNow, hour, minute, 0)
    )
    return Math.floor(date.getTime() / 1000)
  }

  // Events
  // Ads run until next Tuesday: 7 days from now, 20:00 UTC
  const adsEndUnix = getUnixUTC(7, 19, 0)
  // Bidding ends next Monday: 6 days from now, 19:00 UTC
  const biddingEndUnix = getUnixUTC(6, 19, 0)

  return {
    biddingEndUnix,
    adsEndUnix,
  }
}

describe('getDate', () => {
  it('should return an object with biddingEndUnix and adsEndUnix properties', () => {
    const result = getDate()

    expect(result).toBeDefined()
    expect(result.biddingEndUnix).toBeDefined()
    expect(result.adsEndUnix).toBeDefined()
  })

  it('should return unix timestamps as numbers', () => {
    const result = getDate()

    expect(typeof result.biddingEndUnix).toBe('number')
    expect(typeof result.adsEndUnix).toBe('number')
  })

  it('should return biddingEndUnix that is 6 days from now at 19:00 UTC', () => {
    const result = getDate()
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth()
    const day = now.getUTCDate()

    const expectedDate = new Date(Date.UTC(year, month, day + 6, 19, 0, 0))
    const expectedUnix = Math.floor(expectedDate.getTime() / 1000)

    expect(result.biddingEndUnix).toBe(expectedUnix)
  })

  it('should return adsEndUnix that is 7 days from now at 19:00 UTC', () => {
    const result = getDate()
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = now.getUTCMonth()
    const day = now.getUTCDate()

    const expectedDate = new Date(Date.UTC(year, month, day + 7, 19, 0, 0))
    const expectedUnix = Math.floor(expectedDate.getTime() / 1000)

    expect(result.adsEndUnix).toBe(expectedUnix)
  })

  it('should have adsEndUnix later than biddingEndUnix', () => {
    const result = getDate()

    expect(result.adsEndUnix).toBeGreaterThan(result.biddingEndUnix)
  })

  it('should have exactly 24 hours (86400 seconds) difference between bidding and ads end', () => {
    const result = getDate()
    const difference = result.adsEndUnix - result.biddingEndUnix

    expect(difference).toBe(86400) // 24 hours in seconds
  })

  it('should return timestamps that are in the future', () => {
    const result = getDate()
    const nowUnix = Math.floor(Date.now() / 1000)

    expect(result.biddingEndUnix).toBeGreaterThan(nowUnix)
    expect(result.adsEndUnix).toBeGreaterThan(nowUnix)
  })
})
