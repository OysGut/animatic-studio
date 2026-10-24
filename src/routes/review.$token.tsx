import { createFileRoute } from '@tanstack/react-router';
import { StoryboardReviewPage } from '@/app/share/StoryboardReviewPage';
import { LanguageSwitch,useLanguage } from '@/app/i18n/language';
import { t } from '@/core/i18n/keyed';
export const Route=createFileRoute('/review/$token')({head:()=>({meta:[
 {title:t('sb10.title')+' · From Pen to Glass'},
 {name:'description',content:t('sb10.description')},
 {property:'og:title',content:t('sb10.title')}, // i18n-ignore: metakode
 {property:'og:description',content:t('sb10.description')}, // i18n-ignore: metakode
 {property:'og:type',content:'website'}, // i18n-ignore: metakode
 {name:'twitter:card',content:'summary'},
 {name:'robots',content:'noindex, nofollow'},
 {name:'referrer',content:'no-referrer'}
]}),component:ReviewRoute});
function ReviewRoute(){useLanguage();const{token}=Route.useParams();return <><LanguageSwitch compact/><StoryboardReviewPage token={token}/></>;}
