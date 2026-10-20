# Changelog

## [1.28.0](https://github.com/ytspar/devbar/compare/sweetlink-v1.27.1...sweetlink-v1.28.0) (2026-10-20)


### Features

* add release notes validation hook to block publishing without changelog ([e0022dc](https://github.com/ytspar/devbar/commit/e0022dc8621a85db41215f80f0955ae588fb1945))
* add settings persistence and biome linting ([3c85c90](https://github.com/ytspar/devbar/commit/3c85c90af6ab0030641b819fe65ab04866481e7e))
* auto-hide devbar screenshots and harden demo UI ([d655ed8](https://github.com/ytspar/devbar/commit/d655ed842f94814f1bd5e5b9ad6b57c767c0470d))
* code quality improvements, --url navigation, docs overhaul ([e9bebe3](https://github.com/ytspar/devbar/commit/e9bebe3ef72aa0fc8a9be8c19c846b2bb0a91fab))
* **devbar:** add debug mode, presets, theme toggle, compact mode, and Core Web Vitals ([900165d](https://github.com/ytspar/devbar/commit/900165d38eed818754fd0679cc67757c060d5aab))
* **devbar:** add official git-branch and app-version plugins ([5173300](https://github.com/ytspar/devbar/commit/51733004605c447613f7c8d19e265786945cec63))
* **devbar:** add Record button to toolbar for session recording ([93dab08](https://github.com/ytspar/devbar/commit/93dab08c16f6db6df1a44ca45bc2957a6249d0b5))
* **devbar:** HiFi screenshot via Alt+Click, demo button in toolbar ([babc4ed](https://github.com/ytspar/devbar/commit/babc4edc25cf2ef36d1339853f459bb7616432be))
* **playground:** add light theme with terminal aesthetic ([cdf7fa2](https://github.com/ytspar/devbar/commit/cdf7fa22494537c9bd2abd66e4fbf16c12900747))
* **sweetlink:** 20 round-2 UX polishes (1.18.0) ([f7f77fc](https://github.com/ytspar/devbar/commit/f7f77fc6d32b7e55053ff4aba4f95337d6c574a7))
* **sweetlink:** add --batch to capture many frames in one process ([c1fb107](https://github.com/ytspar/devbar/commit/c1fb107d5ff30e46b628c256797526cb4692ac5b))
* **sweetlink:** add --headed mode for daemon, fix integration tests ([430883b](https://github.com/ytspar/devbar/commit/430883bfb67a2d0124998709898fd19d49ea25ce))
* **sweetlink:** add --json and --output-schema flags for structured CLI output ([26b9a9c](https://github.com/ytspar/devbar/commit/26b9a9ce1806a0e10ba20e05fa336a30589568c9))
* **sweetlink:** add app identity for multi-instance targeting ([a2303d2](https://github.com/ytspar/devbar/commit/a2303d216c5055ed49b83c7899a9093dac23053d))
* **sweetlink:** add back-to-app link in viewer header ([4fbda9e](https://github.com/ytspar/devbar/commit/4fbda9ed55b4ada6df817fac7cadcc4612d91548))
* **sweetlink:** Add CLI shutdown synchronization with dev server ([aaad5ec](https://github.com/ytspar/devbar/commit/aaad5ece49f80d11bb97b364716f5b4fed606b81))
* **sweetlink:** add cursor highlight, visual diff, device emulation (Phase 5) ([41a0e67](https://github.com/ytspar/devbar/commit/41a0e6710e9a4209c54160421f459ff4de341afc))
* **sweetlink:** add eval test cases for all bundled Claude skills ([a8f2661](https://github.com/ytspar/devbar/commit/a8f266110ff8da47fc4986b7afd2473c47284595))
* **sweetlink:** add Next.js plugin for zero-config dev server integration ([89a3c13](https://github.com/ytspar/devbar/commit/89a3c13b69433fa4910bc73d707930d594967d8f))
* **sweetlink:** add persistent Playwright daemon infrastructure (Phase 1) ([285bcf8](https://github.com/ytspar/devbar/commit/285bcf82c60770b0ec1e6b9a7f13b81ca24ecdef))
* **sweetlink:** add PR evidence upload and terminal capture (Phase 8) ([2c53515](https://github.com/ytspar/devbar/commit/2c53515eb0096c62d1d9f4766561256771dfbb23))
* **sweetlink:** add ref system with snapshot, click, fill commands (Phase 2) ([8fb98a2](https://github.com/ytspar/devbar/commit/8fb98a224217051ae84a187de91db0fe81ed3401))
* **sweetlink:** add ring buffers and console/network commands (Phase 4) ([9260cab](https://github.com/ytspar/devbar/commit/9260cabf0e68a12061bcbdb0acdfd00ed7544f7a))
* **sweetlink:** add self-contained interactive viewer (Phase 7) ([ae16b13](https://github.com/ytspar/devbar/commit/ae16b13df4b6907677230754b4022c2e120707c9))
* **sweetlink:** add session recording with action timeline (Phase 6) ([8a789c5](https://github.com/ytspar/devbar/commit/8a789c5c081a47885c4200cded7d5c4a762aff3f))
* **sweetlink:** add snapshot diffing and annotated screenshots (Phase 3) ([8f4783d](https://github.com/ytspar/devbar/commit/8f4783d130c934ecb6d571ba2e03b7ab2b39094b))
* **sweetlink:** Android tap-indicator overlays for sim recordings (1.21.0) ([235fe17](https://github.com/ytspar/devbar/commit/235fe17b0e018449f71a4c1384b0699f730fe3be))
* **sweetlink:** auto-open viewer in browser on record stop ([ba38292](https://github.com/ytspar/devbar/commit/ba382924aafda4304c0a81b0aaca7c719a0c097a))
* **sweetlink:** bundle Claude skills, agents, and context files ([bd745d2](https://github.com/ytspar/devbar/commit/bd745d288f3b5f1bae7530724c504c3c5ecbbc2c))
* **sweetlink:** demo document builder (Showboat-inspired) ([e0e6057](https://github.com/ytspar/devbar/commit/e0e60579270f1cdd649664a16b6abecfa5b579eb))
* **sweetlink:** JSON-stdin batching + app/date/run hierarchy (1.20.0) ([9638bc8](https://github.com/ytspar/devbar/commit/9638bc8788202a2a4aab4500b82095264998aa9a))
* **sweetlink:** multi-instance daemon support + Vite auto-start ([7a27445](https://github.com/ytspar/devbar/commit/7a274458c4063a0e6bf6c9988d854a5553e103b9))
* **sweetlink:** ProofShot/Proof features — error detection, summary, overlays ([6be678a](https://github.com/ytspar/devbar/commit/6be678af9e6bcf09635077a77e03fa5774b1b56a))
* **sweetlink:** real WebM video recording + interactive viewer with overlays ([8cc898a](https://github.com/ytspar/devbar/commit/8cc898a13a4e50df1c13ef9b415e95bd139010e7))
* **sweetlink:** serve viewer via daemon HTTP + auto-open from devbar ([838df7a](https://github.com/ytspar/devbar/commit/838df7a478cfcf70585d77aa3bdb006f2f7cb043))
* **sweetlink:** TDD audit — 9 bug fixes + 17 UX polishes (1.17.0) ([e19eb34](https://github.com/ytspar/devbar/commit/e19eb34f00c59cabd60290e8e3a688e0cb54c48e))
* **sweetlink:** terminal + simulator capture (1.19.0) ([b83fbaa](https://github.com/ytspar/devbar/commit/b83fbaa5fedf32798d0f105838d6e421704a9403))
* **sweetlink:** universal sharing — CLI report command + viewer share buttons ([8e6d86f](https://github.com/ytspar/devbar/commit/8e6d86f8b1e1c89ce991c5f15a00f8199917fd3c))
* **sweetlink:** v1.9.0 — async exec, IIFE auto-wrap, --wait-for flag ([d0e643e](https://github.com/ytspar/devbar/commit/d0e643ea3db9550cf12dbc5fa1dc4fcab38c4b07))


### Bug Fixes

* address all product-finalizer audit findings ([66f10b5](https://github.com/ytspar/devbar/commit/66f10b50321ae2c10c33a706156dafd891aeb364))
* address product-finalizer audit findings ([5b23f83](https://github.com/ytspar/devbar/commit/5b23f83beed5e23aff5f72a96715a28f9b248355))
* agent bridge under HTTPS proxies + daemon navigation/lifecycle ([#25](https://github.com/ytspar/devbar/issues/25)) ([3b47fc3](https://github.com/ytspar/devbar/commit/3b47fc34aae616e1ebad9a6e6e9912f8393a7c88))
* inline DepartureMono font as base64 data URI, capture browser-level errors ([c057cb1](https://github.com/ytspar/devbar/commit/c057cb1b4d29214bcb9fc9ca46bad83c5b565cbd))
* support portless localhost origins ([bbefaa4](https://github.com/ytspar/devbar/commit/bbefaa496a7b0f0fa792ba8f0daef2cc5b452025))
* **sweetlink:** add default condition to subpath exports (1.16.1) ([3ecea13](https://github.com/ytspar/devbar/commit/3ecea1338d70295c7d0feaa4705d8547e2456df9))
* **sweetlink:** Address product-finalizer audit findings + add 209 tests ([9c4fd8f](https://github.com/ytspar/devbar/commit/9c4fd8f75e8fd30dc0cb4f5718c928e2eae9fc10))
* **sweetlink:** bind --serve to 0.0.0.0 + clipboard fallback for file:// ([7bdfd3d](https://github.com/ytspar/devbar/commit/7bdfd3d4d113a00cce0722e36f95c710e1e01f75))
* **sweetlink:** bump 1.24.6 to ship resize-for-claude/SKILL.md (DEV-4814) ([#15](https://github.com/ytspar/devbar/issues/15)) ([889a040](https://github.com/ytspar/devbar/commit/889a040108941ab6d54e86eff84ea70d0c04d1f4))
* **sweetlink:** bundle resize-for-claude script with its skill ([#19](https://github.com/ytspar/devbar/issues/19)) ([dd3c1f1](https://github.com/ytspar/devbar/commit/dd3c1f1de99170fe28eda9af7c2c0bad2bfe2e71))
* **sweetlink:** capture project root at server initialization ([b7a4aca](https://github.com/ytspar/devbar/commit/b7a4aca8020e00c471ad1bdec5d433633626669e))
* **sweetlink:** hide devbar with opacity:0 so an expanded bar can't leak ([#24](https://github.com/ytspar/devbar/issues/24)) ([5003bb4](https://github.com/ytspar/devbar/commit/5003bb4187d130888bd79825fdb301b3c9eb2827))
* **sweetlink:** keep wide images/video inside the HTML review viewers ([#30](https://github.com/ytspar/devbar/issues/30)) ([f3e7a55](https://github.com/ytspar/devbar/commit/f3e7a558dbdd79da14fede397797990fd7e20a79))
* **sweetlink:** reuse the daemon browser and honour Portless URLs ([51054c5](https://github.com/ytspar/devbar/commit/51054c50fbb1bdea306321e24df03e27db0334f0))
* **sweetlink:** stop probing ws://localhost from remote page origins ([#44](https://github.com/ytspar/devbar/issues/44)) ([408b43b](https://github.com/ytspar/devbar/commit/408b43b345313459d96cfa56288695ced226e433))
* **sweetlink:** sync console log counts with buffer on eviction ([4038807](https://github.com/ytspar/devbar/commit/403880765c71869ca1b4d75255bdc48138e911aa))
* **tests:** update mocks for common.js refactor and WebSocketServer constructor ([9a21eeb](https://github.com/ytspar/devbar/commit/9a21eeb5881b7e2fb38cfb44fb2bbbca4b56db8a))

## [1.27.0](https://github.com/ytspar/devbar/compare/sweetlink-v1.26.4...sweetlink-v1.27.0) (2026-07-21)


### Features

* **sweetlink:** add --batch to capture many frames in one process ([c1fb107](https://github.com/ytspar/devbar/commit/c1fb107d5ff30e46b628c256797526cb4692ac5b))


### Bug Fixes

* **sweetlink:** reuse the daemon browser and honour Portless URLs ([51054c5](https://github.com/ytspar/devbar/commit/51054c50fbb1bdea306321e24df03e27db0334f0))

## [1.26.4](https://github.com/ytspar/devbar/compare/sweetlink-v1.26.3...sweetlink-v1.26.4) (2026-07-17)


### Bug Fixes

* **sweetlink:** keep wide images/video inside the HTML review viewers ([#30](https://github.com/ytspar/devbar/issues/30)) ([f3e7a55](https://github.com/ytspar/devbar/commit/f3e7a558dbdd79da14fede397797990fd7e20a79))

## [1.26.3](https://github.com/ytspar/devbar/compare/sweetlink-v1.26.2...sweetlink-v1.26.3) (2026-07-05)


### Bug Fixes

* agent bridge under HTTPS proxies + daemon navigation/lifecycle ([#25](https://github.com/ytspar/devbar/issues/25)) ([3b47fc3](https://github.com/ytspar/devbar/commit/3b47fc34aae616e1ebad9a6e6e9912f8393a7c88))
* **sweetlink:** bump 1.24.6 to ship resize-for-claude/SKILL.md (DEV-4814) ([#15](https://github.com/ytspar/devbar/issues/15)) ([889a040](https://github.com/ytspar/devbar/commit/889a040108941ab6d54e86eff84ea70d0c04d1f4))
* **sweetlink:** bundle resize-for-claude script with its skill ([#19](https://github.com/ytspar/devbar/issues/19)) ([dd3c1f1](https://github.com/ytspar/devbar/commit/dd3c1f1de99170fe28eda9af7c2c0bad2bfe2e71))
* **sweetlink:** hide devbar with opacity:0 so an expanded bar can't leak ([#24](https://github.com/ytspar/devbar/issues/24)) ([5003bb4](https://github.com/ytspar/devbar/commit/5003bb4187d130888bd79825fdb301b3c9eb2827))

## [1.26.2](https://github.com/ytspar/devbar/compare/sweetlink-v1.26.1...sweetlink-v1.26.2) (2026-07-02)


### Bug Fixes

* **sweetlink:** bump 1.24.6 to ship resize-for-claude/SKILL.md (DEV-4814) ([#15](https://github.com/ytspar/devbar/issues/15)) ([889a040](https://github.com/ytspar/devbar/commit/889a040108941ab6d54e86eff84ea70d0c04d1f4))
* **sweetlink:** bundle resize-for-claude script with its skill ([#19](https://github.com/ytspar/devbar/issues/19)) ([dd3c1f1](https://github.com/ytspar/devbar/commit/dd3c1f1de99170fe28eda9af7c2c0bad2bfe2e71))
* **sweetlink:** hide devbar with opacity:0 so an expanded bar can't leak ([#24](https://github.com/ytspar/devbar/issues/24)) ([5003bb4](https://github.com/ytspar/devbar/commit/5003bb4187d130888bd79825fdb301b3c9eb2827))

## [1.26.1](https://github.com/ytspar/devbar/compare/sweetlink-v1.26.0...sweetlink-v1.26.1) (2026-07-02)


### Bug Fixes

* **sweetlink:** bundle resize-for-claude script with its skill ([#19](https://github.com/ytspar/devbar/issues/19)) ([dd3c1f1](https://github.com/ytspar/devbar/commit/dd3c1f1de99170fe28eda9af7c2c0bad2bfe2e71))
