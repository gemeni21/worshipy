# Content & Rights Checklist

> **Important Legal Notice**: All song lyrics, chord charts, arrangements, sheet music, audio recordings, and video tutorials distributed in a production environment must be properly cleared for their intended uses before publication or distribution.

---

## 1. Current MVP Demo Catalog Status

All songs included in the initial MVP seed catalog (`src/data/demo-songs.json`) are **100% original fictional/demo compositions** created specifically to test and demonstrate the application's search, filtering, structured chord rendering, and transposition features.

- Every demo song is explicitly marked with `contentStatus: "demo"`.
- No copyrighted commercial worship lyrics, chord charts, or arrangements are reproduced in this repository.
- Having a `contentStatus` field (such as `"authorized"` or `"public-domain"`) in the technical schema is an internal catalog-tracking field only and **does not constitute legal clearance**.

---

## 2. Pre-Production Content Clearance Checklist

Before replacing demo songs or distributing songs to a worship team or the public, verify and document the following for every record added to the catalog:

- [ ] **Composition & Lyric Rights**:
  - Is the song an original composition owned by your church/ministry, in the verified public domain, or covered by a valid license agreement that explicitly permits digital lyric and chord chart display/storage?
  - Note: Standard church projection licenses do not automatically grant rights to distribute songs in a public or third-party software application. Verify the exact scope of your license.
- [ ] **Arrangement & Chord Chart Rights**:
  - Was the chord chart transcribed or arranged internally with proper authorization, rather than copied or scraped from third-party chord websites?
- [ ] **Writer & Publisher Attribution**:
  - Are complete songwriter credits (`writers`), copyright notices, and `sourceNotes` accurately populated on the song record?
- [ ] **Offline Caching Permissions**:
  - Does your authorization allow end users to store local offline copies of the chart on their personal devices?
- [ ] **Future Media & Tutorials (Pro Roadmap)**:
  - Before adding any audio tracks, stems, or video lessons in future versions, ensure synchronization, master use, and mechanical/performance clearances are obtained in writing.

---

## 3. Prohibited Content Practices

1. **No Web Scraping**: Never scrape lyrics or chord charts from third-party websites or lyric databases.
2. **No Unauthorized Reproduction**: Do not copy commercial songbooks, PDFs, or proprietary arrangements without explicit permission.
3. **No Unlicensed Media Embeds**: Do not embed unauthorized video streams or downloadable audio files.

---

## 4. Personal Songs (`My Songs`) & ChordPro Import/Export Responsibilities

The **My Songs (`/my-songs`)** feature allows individual musicians and worship leaders to create songs manually or import/export **ChordPro (`.cho`, `.chopro`, `.crd`, `.chord`, `.pro`, `.txt`)** files on their own device.

1. **Device-Local Storage Only**:
   - Personal songs created or imported in `My Songs` are stored locally in the user's browser (`IndexedDB` + `localStorage` mirror) with `sourceType: "custom"`.
   - Personal songs are not uploaded to a public catalog or shared across devices automatically.
2. **User Authorization & Rights Confirmation**:
   - Users must only enter, paste, or import songs they wrote (original compositions), songs in the verified public domain, or songs they are explicitly authorized to store and use on their personal device.
   - Both the Manual Song Editor and the ChordPro Importer require an explicit rights acknowledgment and provide dedicated **Copyright / Attribution** (`attribution`) and **Rights / License Notes** (`rightsNotes`) fields.
3. **Protection of Built-In Catalog Records**:
   - Custom songs always receive a distinct `custom-song-*` identifier and URL slug (`sourceType: "custom"`).
   - Saving, editing, or deleting a personal song can never overwrite or delete a built-in catalog song record (`sourceType: "catalog"`).

