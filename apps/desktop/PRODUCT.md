# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Nemeton is for players who keep games across storefronts and local installations. Product priorities, in order:

1. Launch and organize games from multiple storefronts in one library.
2. Manage saves and keep track of play history.
3. Browse and launch games from the couch with a controller.

## Product Purpose

Nemeton is a local-first desktop game launcher. It brings together installed games, owned libraries, local executables, playtime, achievements, and save backups. A player can add a local game and start using the library without a Nemeton account or hosted service.

## Positioning

Players explicitly group matching store copies of a game while retaining each copy's installation, sessions, and store counters. Nemeton reconciles store playtime with locally tracked sessions and marks totals as partial when it cannot establish overlap.

## Operating Context

- The interface uses React in Electron. Windows is the primary supported desktop platform, and the project also packages Linux builds.
- Installed Steam games can be discovered without Steam API credentials. Full Steam account imports use the Steam Web API. Epic and GOG imports use locally configured helpers.
- Library and credential data stay on the player's computer. Manual history, achievement history, and saves can sync through a folder the player controls.
- Big Picture provides a controller-oriented view for couch use.

## Capabilities and Constraints

- Organize games with collections, tags, remembered filters, and shortcuts for recent and pending games.
- Launch games through their store adapter or a local executable, track sessions, and review playtime and achievements.
- Discover save locations through the Ludusavi manifest and create versioned backups with archive validation and retention.
- Manage store and other download tasks, then add completed downloads to the library through an explicit user action.

## Brand Commitments

The product name is Nemeton. The existing mark is in `resources/nemeton-mark.svg`.

## Product Principles

- Make it easy to find and launch a game regardless of where the player owns it.
- Let players control how copies are grouped, where data lives, and which services they connect.
- Make uncertainty visible when store history and locally tracked sessions cannot be reconciled.
- Preserve controller access to the core couch workflow.
