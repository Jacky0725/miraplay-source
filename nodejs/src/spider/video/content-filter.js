// Conservative title/metadata screening for adult sources. Recheck detail before playback.
const EXCLUDED = /未成年|未滿(?:十八|18)|未满(?:十八|18)|未到十八|小學|小学|初中|高中|中學|中学|高校生|女子高生|女学生|女學生|学生|學生|校園|校园|學園|学園|学校|學校|女子校|师生|師生|学妹|學妹|学姐|學姐|少女|幼女|萝莉|蘿莉|正太|儿童|兒童|童貞|童年|制服|ロリ|女子校生|未成年者|18歳未満|schoolgirl|schoolboy|underage|minor|teen|lolita|\b(?:jk|jc|js)\b|继女|繼女|继子|繼子|兒子|儿子|女兒|女儿|妹妹|弟弟|いもうと|妹|義妹|義弟|継娘|継息子|母子|父女|母女|父子|親子|乱伦|亂倫|近親|强奸|強姦|强迫|強迫|迷奸|監禁|监禁|凌辱|rape|nonconsensual/i;

export function allowedAdultMetadata(...values) {
    const text = values.flat(Infinity).filter((value) => value != null)
        .map((value) => String(value)).join(' ').normalize('NFKC');
    return !!text.trim() && !EXCLUDED.test(text);
}

export function cleanEpisodeTitle(value, fallback) {
    return String(value || fallback).replace(/[$#]/g, ' ').trim();
}
