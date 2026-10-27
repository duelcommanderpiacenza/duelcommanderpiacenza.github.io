# Recap music

The event / season recaps (js/event-recap.js) play one of these tracks at
random. To add one:

1. Put the file here — an `.mp3`, ideally 30–90 seconds, instrumental,
   under ~1.5 MB (it loops if shorter than the recap, ~45 s).
2. Name it `recap-N.mp3` (the next number) and raise the count in
   `RECAP_TRACKS` in js/event-recap.js.
3. Write it in the list below with its source and licence.

**Only royalty-free tracks whose licence allows use on a public website**
(e.g. the Pixabay Content License, YouTube Audio Library "no attribution
required"). A track that needs attribution (Creative Commons BY) must be
credited — tell whoever maintains the site, so the credit is shown.

## Tracks

Each is the track's first 50 seconds (a recap lasts ~45 s, and loops), a
2.5 s fade-out at the end, levelled to −16 LUFS, 128 kbps mp3 (~0.8 MB) —
made with ffmpeg:

    ffmpeg -t 50 -i original.mp3 -af "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.3,afade=t=out:st=47.5:d=2.5" -ar 44100 -ac 2 -b:a 128k -map_metadata -1 recap-N.mp3

| File | Title — author | Source | Licence |
|---|---|---|---|
| recap-1.mp3 | Dance With You — Everet Almond | ? | ? |
| recap-2.mp3 | Don't Yuck My Yum — Blue Deer Studio | ? | ? |
| recap-3.mp3 | Friction — Blue Deer Studio | ? | ? |
| recap-4.mp3 | Gloom Of Hearts — Blue Deer Studio | ? | ? |
| recap-5.mp3 | Here With Me — Televisions | ? | ? |
| recap-6.mp3 | Remember — Everet Almond | ? | ? |
| recap-7.mp3 | Steal My Love — Blue Deer Studio | ? | ? |
