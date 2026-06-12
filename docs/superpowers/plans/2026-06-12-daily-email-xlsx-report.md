# Daily Email XLSX Report Implementation Plan

1. Update email tests to require a compact summary and only five critical rows.
2. Add tests for positive-purchase report rows, sort order, XLSX attachment, and
   temporary-file cleanup.
3. Refactor `buildDailyEmail_` to create the compact plain-text and HTML summary.
4. Add helpers to build, format, export, and clean up the temporary report.
5. Update `runDailyAnalysisAndEmail` to send the XLSX attachment.
6. Run the complete test suite and JavaScript syntax checks.
7. Commit and push the verified change to `main`.
