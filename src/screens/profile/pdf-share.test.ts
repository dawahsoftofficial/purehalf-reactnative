import LanguageKeys from '../../languages/Keys';
import {
  buildPdfDataUrl,
  buildShareFilename,
  previewSections,
} from './pdf-share';

describe('buildShareFilename', () => {
  it('builds a filename from the first name', () => {
    expect(buildShareFilename('Ahmed')).toBe('PureHalf-Profile-Ahmed.pdf');
  });

  it('strips whitespace and falls back when the name is empty', () => {
    expect(buildShareFilename('   ')).toBe('PureHalf-Profile.pdf');
    expect(buildShareFilename(undefined)).toBe('PureHalf-Profile.pdf');
  });

  it('strips characters that are unsafe in filenames', () => {
    expect(buildShareFilename('Ahmed/Khan')).toBe(
      'PureHalf-Profile-AhmedKhan.pdf'
    );
  });
});

describe('buildPdfDataUrl', () => {
  it('prefixes the base64 payload with the PDF data URL scheme', () => {
    expect(buildPdfDataUrl('JVBERi0xLjQ=')).toBe(
      'data:application/pdf;base64,JVBERi0xLjQ='
    );
  });
});

describe('previewSections', () => {
  it('lists a section once any of its fields are filled in', () => {
    const sections = previewSections({ prayers_punctuality_id: 3 });
    expect(sections).toContain(LanguageKeys.islamicValues);
  });

  it('omits sections with nothing filled in', () => {
    const sections = previewSections({ prayers_punctuality_id: 3 });
    expect(sections).not.toContain(LanguageKeys.lifeStyle);
  });

  it('returns an empty list for an undefined detail', () => {
    expect(previewSections(undefined)).toEqual([]);
  });
});
