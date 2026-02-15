const environment = process.env.ENVIRONMENT ?? 'DEVELOPMENT'

const channelIds =
  environment === 'PRODUCTION'
    ? {
        auctionsTickets: '1012032743250595921',
        auctionsStatus: '1064940583266820106',
        modTickets: '1285771377160491049',
        modlogs: '325648177178869760',
        amaChannel: '1411797299356504277',
        inactiveThreadAlerts: '264890171575631873',
        inactiveThreadAlertsReviewers: '767390925051133984',
      }
    : {
        auctionsTickets: '1401293838059831377',
        auctionsStatus: '1401719092070842398',
        modTickets: '1401293811556024470',
        modlogs: '1405010949152444500',
        errors: '1403884779408986243',
        amaChannel: '1405679285620183070',
        inactiveThreadAlerts: '1402817633564491836',
        inactiveThreadAlertsReviewers: '1402817633564491836',
      }

const roleIds =
  environment === 'PRODUCTION'
    ? {
        supportTeam: '817055174613794826',
        auctionsStatus: '1064947337207746640',
        modNotifications: '1285772713662742569',
        moderator: '304313580025544704',
        reviewer: '767389896133443625',
        trialReviewer: '767392998157451265',
        reviewerNotifications: '1405176681785725071',
      }
    : {
        supportTeam: '1401718580328005682',
        auctionsStatus: '1401718663496863846',
        modNotifications: '1401718772854685736',
        moderator: '1401718772854685736',
        reviewer: '767320282427686932',
        trialReviewer: '767392998157451265',
        reviewerNotifications: '1405176115760463913',
      }

const resolvedFlag = '[Resolved]' // optionally, change this too if needed

export { channelIds, roleIds, resolvedFlag }
