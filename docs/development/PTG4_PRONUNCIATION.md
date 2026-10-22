# PTG4 – uttalegrunnlag

NB Uttale v1.0: https://www.nb.no/sprakbanken/ressurskatalog/en/oai-nb-no-sbr-79/
Direkte kilde: https://www.nb.no/sbfil/uttaleleksikon/nb_uttale_leksika.zip
216 vanlige bokmålsordformer er hentet ordrett fra `e_written_pronunciation_lexicon.csv`, kolonnen `nofabet_transcription` (østnorsk skriftstil). Første forekomst brukes. Kompakt JSON, ikke hele leksikonet, leveres som plattformnøytral data. Lisens CC0 1.0: https://data.norge.no/en/datasets/15fd1d9d-eb06-3674-b07a-623abe79af82/nb-uttale-norwegian-pronunciation-lexicon

CMUdict: https://github.com/cmusphinx/cmudict, 138 vanlige engelske ord, første uttale fra `cmudict.dict` (ARPAbet). Lisens BSD; den komplette lisensen beholdes i `src/core/interchange/CMUDICT-LICENSE.txt`. Begge utvalg hentet 22.10.2026. Kompakt JSON komprimeres av vanlig leveransekomprimering, uten binær dekoding i kjernen.

Ukjente ord bruker deterministisk grafemreserve. Fonem→munn er en animasjonsheuristikk, ikke fonetisk fasit. Utkast trenger kjente ordtider; ingen ordtider oppfinnes og ingen KI/lydtjeneste kalles. Rhubarb-lydfinjustering er utsatt.
