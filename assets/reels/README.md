# Reel audio

Put the Hare Krishna recording here as `hare-krishna.mp3` (MP3 or M4A; 12 seconds
or longer; a few MB at most). It is baked into every Instagram Reel by
`scripts/reels/make-reels.ts`, from `REEL_AUDIO_OFFSET` seconds in (default 0),
faded in over 1 second and out over the last 1.5 seconds.

Only a recording the owner holds the rights to goes here. Without the file the
renderer renders nothing and ends quietly, so no silent reel is ever posted.
