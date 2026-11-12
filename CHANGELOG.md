# @fungi.computer/inkcap

## 0.10.0

### Minor Changes

- Changes since 0.9.0:

  - fix(inkcap): keep the window alive on Save As and keep the File menu across
    tabs
  - feat(window): add in-App Forward to the window contract and title bar

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.10.0
  - @fungi.computer/caps@0.11.0
  - @fungi.computer/nacre@0.5.0

## 0.9.0

### Minor Changes

- Changes since 0.8.11:

  - fix(inkcap): don't report a cancelled read after the App is gone
  - fix(inkcap): give a renamed draft a fresh editor so typing lands after Save
    As or Download
  - fix(inkcap): stop exporting test helpers nothing imports
  - feat(inkcap): replace the file path bar with a More menu in the tab strip
  - fix(inkcap): keep a tab's icon and name on one row in the 32px strip

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.10.8

## 0.8.11

### Patch Changes

- Changes since 0.8.10:

  - fix(inkcap,trellis): make the strip under the app header 32px

## 0.8.10

### Patch Changes

- Changes since 0.8.9:

  - fix(inkcap): start the tab strip at the open file when it is clipped
  - fix(inkcap): fade the tab strip edge that hides tabs
  - fix(prints,inkcap): tighten alignment, spacing and sizing

- Updated dependencies
  - @fungi.computer/caps@0.10.7

## 0.8.9

### Patch Changes

- Changes since 0.8.8:

  - fix(inkcap): keep a heading extension only when the heading looks like a
    file name
  - fix(inkcap): keep a typed Save As path and never join a full path as a name
  - fix(inkcap): name a deleted file, not its folder, when an edit finds nothing
  - fix(inkcap): answer a missing folder from the host, open Files for New file,
    centre the welcome
  - fix(inkcap): say how to fix an Agent write outside the Computer, centre the
    first-run welcome
  - fix(inkcap): refuse a missing folder to the Agent and give a first run the
    whole window

- Updated dependencies
- Updated dependencies
  - @fungi.computer/caps@0.10.6
  - @fungi.computer/nacre@0.4.6

## 0.8.8

### Patch Changes

- Changes since 0.8.7:

  - fix(apps): restore first-step emphasis and empty-state headings
  - fix(apps): tighten Inkcap Trellis and Bonsai first views

- Updated dependencies
  - @fungi.computer/caps@0.10.5

## 0.8.7

### Patch Changes

- Updated dependencies
  - @fungi.computer/nacre@0.4.5

## 0.8.6

### Patch Changes

- Changes since 0.8.5:

  - fix(caps): keep paired empty-state actions explicit
  - fix(ui): restore consistent first-use empty state panels
  - fix(inkcap): format repository row height explicitly
  - fix(inkcap): make file actions usable on phones
  - fix(inkcap): finish responsive recovery and bundle proof
  - fix(bonsai): complete first-use flow with Inkcap

- Updated dependencies
  - @fungi.computer/caps@0.10.4

## 0.8.5

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.10.3

## 0.8.4

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.10.2

## 0.8.3

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.9.1
  - @fungi.computer/nacre@0.4.4

## 0.8.2

### Patch Changes

- Updated dependencies
  - @fungi.computer/nacre@0.4.3
  - @fungi.computer/caps@0.10.1

## 0.8.1

### Patch Changes

- Changes since 0.8.0:

  - fix(inkcap): preserve typing and save the live document

## 0.8.0

### Minor Changes

- Changes since 0.7.1:

  - feat(inkcap): suggested names create files at once and Save flushes live
    text

### Patch Changes

- Updated dependencies
  - @fungi.computer/nacre@0.4.2

## 0.7.1

### Patch Changes

- Changes since 0.7.0:

  - fix(inkcap): trim the empty editor to one action, honest copy and one voice

## 0.7.0

### Minor Changes

- Changes since 0.6.1:

  - feat(inkcap): the empty editor suggests file names and uses the living blobs
  - fix(inkcap): a new file takes the first keystroke and the workbench proof
    follows the new copy

## 0.6.1

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @fungi.computer/caps@0.10.1
  - @fungi.computer/nacre@0.4.1

## 0.6.0

### Minor Changes

- Changes since 0.5.0:

  - feat(tourtois): window loading, failure card, priority and Choose Computer
    chip

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @fungi.computer/caps@0.10.0
  - @fungi.computer/nacre@0.4.0

## 0.5.0

### Minor Changes

- Changes since 0.4.0:

  - feat(agar): first-run setup facts, openSetup, more permission families

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.9.0
  - @fungi.computer/caps@0.9.0
  - @fungi.computer/computer-contract@0.1.0
  - @fungi.computer/nacre@0.3.0

## 0.4.0

### Minor Changes

- Changes since 0.3.3:

  - fix(inkcap): the phone files sheet hugs an empty folder
  - fix(inkcap): quiet explorer empty state, draft copy without a Computer,
    shortcut as a hint
  - feat(inkcap): say what it is, one primary, explorer verbs and a Files button
    on phones
  - fix(inkcap): download path says download and the saved toast shows in the
    workbench
  - fix(inkcap): a draft save opens save-as and every save says saved

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.8.0
  - @fungi.computer/caps@0.8.0
  - @fungi.computer/stipe@0.1.1
  - @fungi.computer/nacre@0.2.3
  - @fungi.computer/computer-contract@0.0.13

## 0.3.3

### Patch Changes

- @fungi.computer/agar@0.7.3
  - @fungi.computer/computer-contract@0.0.12

## 0.3.2

### Patch Changes

- Updated dependencies
  - @fungi.computer/agar@0.7.2
  - @fungi.computer/computer-contract@0.0.11

## 0.3.1

### Patch Changes

- Changes since 0.3.0:

  - fix(inkcap): defer repository editor until a repository opens

- @fungi.computer/caps@0.7.1

## 0.3.0

### Minor Changes

- Changes since 0.2.9:

  - feat(front-doors): lead with the local try-it path and an install-now button

## 0.2.9

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.7.1
  - @fungi.computer/agar@0.7.1
  - @fungi.computer/computer-contract@0.0.10

## 0.2.8

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.7.0
  - @fungi.computer/caps@0.7.0
  - @fungi.computer/computer-contract@0.0.9

## 0.2.7

### Patch Changes

- @fungi.computer/caps@0.6.0
  - @fungi.computer/computer-contract@0.0.8

## 0.2.6

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.6.0
  - @fungi.computer/agar@0.6.1
  - @fungi.computer/computer-contract@0.0.7

## 0.2.5

### Patch Changes

- Changes since 0.2.4:

  - fix(inkcap): key the shared repository History control

- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.6.0
  - @fungi.computer/caps@0.5.0
  - @fungi.computer/computer-contract@0.0.6

## 0.2.4

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.5.0
  - @fungi.computer/caps@0.4.0
  - @fungi.computer/whistle@0.3.0
  - @fungi.computer/computer-contract@0.0.5

## 0.2.3

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.4.0
  - @fungi.computer/caps@0.3.1
  - @fungi.computer/whistle@0.2.0
  - @fungi.computer/computer-contract@0.0.4

## 0.2.2

### Patch Changes

- Updated dependencies
  - @fungi.computer/caps@0.3.0
  - @fungi.computer/agar@0.3.1
  - @fungi.computer/computer-contract@0.0.3

## 0.2.1

### Patch Changes

- @fungi.computer/computer-contract@0.0.2

## 0.2.0

### Minor Changes

- Changes since 0.1.0:

  - fix(oyster): keep Stage out of the starter release
  - fix(inkcap): preserve missing binding grants as domain refusals
  - fix(agar): discover the parent host without a referrer
  - fix(oyster): checkpoint durable installation owner and correlated client
  - feat(tui): isolate independent leader and Grove bundle
  - feat(oyster): derive App build recipes from package metadata
  - test(inkcap): settle mounted effects before closing RPC
  - refactor(computer)!: move the operation contract into computer-contract
  - feat(oyster): add stage to the starter apps
  - feat(oyster): public release 0.2.0

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.3.0
  - @fungi.computer/cairn@0.1.0
  - @fungi.computer/caps@0.2.0
  - @fungi.computer/computer-contract@0.0.1
  - @fungi.computer/stipe@0.1.0
  - @fungi.computer/whistle@0.1.0

## 0.1.0

### Minor Changes

- Changes since 0.0.1:

  - fix(agar): keep the result-row decoder out of Apps that do not present
  - fix(apps): give every host navigation fake the new onActivate
  - feat(apps): describe finished Prints, Inkcap, Shed and Bonsai calls
  - feat(oyster): public release 0.1.0

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.2.0
  - @fungi.computer/caps@0.1.0
  - @fungi.computer/computer@0.1.0
  - @fungi.computer/whistle@0.0.2

## 0.0.1

### Patch Changes

- Initial public release of @fungi.computer/inkcap.
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @fungi.computer/agar@0.1.0
  - @fungi.computer/caps@0.0.2
  - @fungi.computer/computer@0.0.1
