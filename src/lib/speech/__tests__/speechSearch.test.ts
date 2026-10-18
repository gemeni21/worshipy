import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSpokenTranscript } from '../useVoiceSearch.ts';

describe('Voice Search Transcript Cleaning & Normalization', () => {
  it('cleans trailing punctuation and periods from voice transcripts', () => {
    assert.equal(cleanSpokenTranscript('Goodness of God.'), 'Goodness of God');
    assert.equal(cleanSpokenTranscript('Way Maker?!'), 'Way Maker');
    assert.equal(cleanSpokenTranscript('  Salamat Panginoon.  '), 'Salamat Panginoon');
    assert.equal(cleanSpokenTranscript('10,000 Reasons...'), '10,000 Reasons');
  });

  it('preserves inner punctuation such as commas or apostrophes in titles', () => {
    assert.equal(cleanSpokenTranscript('10,000 Reasons'), '10,000 Reasons');
    assert.equal(cleanSpokenTranscript("King of Kings"), "King of Kings");
    assert.equal(cleanSpokenTranscript("God's Great Dance Floor"), "God's Great Dance Floor");
  });

  it('handles empty or whitespace strings safely', () => {
    assert.equal(cleanSpokenTranscript(''), '');
    assert.equal(cleanSpokenTranscript('   '), '');
    assert.equal(cleanSpokenTranscript('...'), '');
  });
});
