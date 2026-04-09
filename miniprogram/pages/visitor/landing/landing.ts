import { brandConfig } from '../../../config/brand'

Page({
  data: {
    visitorWelcomeTitle: brandConfig.visitorWelcomeTitle,
    visitorUnregisteredTitle: brandConfig.visitorUnregisteredTitle
  },

  onLoad() {
    wx.setNavigationBarTitle({
      title: brandConfig.visitorNavigationTitle
    })
  }
});
