const environment = process.env.ENVIRONMENT ?? 'DEVELOPMENT'

const channelIds =
  environment === 'PRODUCTION'
    ? {
        auctionsTickets: '1012032743250595921',
        auctionsStatus: '1064940583266820106',
        modTickets: '1285771377160491049',
        modlogs: '325648177178869760',
      }
    : {
        auctionsTickets: '1401293838059831377',
        auctionsStatus: '1401719092070842398',
        modTickets: '1401293811556024470',
        modlogs: '325648177178869760',
      }

const roleIds =
  environment === 'PRODUCTION'
    ? {
        supportTeam: '817055174613794826',
        auctionsStatus: '1064947337207746640',
        modNotifications: '1285772713662742569',
        moderator: '304313580025544704',
      }
    : {
        supportTeam: '1401718580328005682',
        auctionsStatus: '1401718663496863846',
        modNotifications: '1401718772854685736',
        moderator: '1401718772854685736',
      }

const resolvedFlag = '[Resolved]' // optionally, change this too if needed

export { channelIds, roleIds, resolvedFlag }
