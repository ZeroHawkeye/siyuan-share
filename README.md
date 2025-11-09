[中文](./README_zh_CN.md)

# SiYuan Share Plugin

> Publish selected SiYuan documents or blocks as publicly accessible pages for quick demo, collaboration viewing, or external sharing.

## Features

- One-click share to generate a public link.
- Incremental update on re-share (subject to version capability).
- Bundles images/attachments automatically.
- Manage links: view/revoke in plugin panel.
- Basic visit stats (planned).

## Server configuration

- Test endpoint: <https://share.sec-lab.cn>
  - For testing only. Stability and data persistence are NOT guaranteed. Do not store sensitive/important data.
- You can configure a custom server in the plugin Settings panel.

## Quick start

1. Install and enable the plugin from the SiYuan Bazaar.
2. Open a document (or locate a block) you want to share.
3. Use the plugin’s share entry (button/menu).
4. On first use, set the server endpoint (use the test endpoint or your own).
5. Copy the generated link and share it with others.
6. To revoke, remove the item in “Share List” so the link becomes invalid.

## FAQ

| Question | Hint |
|----------|------|
| Link not accessible | Check server availability or whether the share was revoked |
| Images missing | Resource upload may be in progress; refresh later or re-share |
| Data lost on test endpoint | Test environment may be cleaned periodically; deploy your own server for stability |
| Privacy | Avoid sharing sensitive content; revocation disables access |

## Notes & Disclaimer

- We are not responsible for third-party server availability, persistence, or security.
- Data on the test endpoint may be purged at any time. Always keep your original notes.
- Sharing publishes your selected content to the public internet. Review and remove sensitive information beforehand.

## Support

- Project & issues: <https://github.com/ZeroHawkeye/siyuan-share>
- When reporting, please include plugin version, SiYuan version, and reproduction steps.