# Bardic Inspiration Tracker

A small Foundry VTT module for D&D 5e that attaches a bardic inspiration tracker panel to character sheets.

## Features

- GM can configure one bard and a tracked party list.
- Each tracked party member shows portrait and inspiration status.
- Clicking the icon consumes bardic inspiration and rolls the bard's die.
- If the die cannot be inferred from the bard actor, a manual die override can be configured.
- The panel opens attached to actor sheets.

## Install

Copy this folder into:

Data/modules/bardic-inspiration-tracker

Then enable the module in your world.

## Notes

- Built for Foundry VTT v13 and D&D 5e worlds.
- The module stores party configuration on the World document and inspiration state on each Actor via flags.
