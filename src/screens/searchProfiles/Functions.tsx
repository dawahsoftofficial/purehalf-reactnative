import { LanguageKeys } from '../../languages';
import { ApiServices, flashErrorMessage } from '../../services';

const onSearch = async (
  ageRange: any,
  filtersDataList: any,
  nameQuery = ''
) => {
  return new Promise((resolve, reject) => {
    let urlParams = '';
    let searchForPeople = '';
    if (ageRange?.minAge) {
      urlParams = urlParams + `&min_age=${ageRange?.minAge}`;
    }
    if (ageRange?.maxAge) {
      urlParams = urlParams + `&max_age=${ageRange?.maxAge}`;
    }
    if (nameQuery.trim().length > 0) {
      urlParams = urlParams + `&name=${encodeURIComponent(nameQuery.trim())}`;
    }
    filtersDataList.forEach((element: any) => {
      if (Object.keys(element?.selected).length !== 0) {
        if (element.apiKey === 'search_for_people') {
          searchForPeople = element?.selected?.id;
        }
        if (
          (searchForPeople === 'location' && element.apiKey === 'country') ||
          (searchForPeople === 'country' && element.apiKey === 'radius')
        )
          return;
        urlParams = urlParams + `&${element.apiKey}=${element?.selected?.id}`;
      }
    });
    ApiServices.searchFilterApply(urlParams)
      .then((data: any) => {
        const response = {
          data: data,
          urlParams: urlParams,
        };
        resolve(response);
      })
      .catch(() => reject(''));
  });
};

const saveAndSearch = (
  ageRange: any,
  filtersDataList: any,
  options: { title: any; nameQuery?: string }
) => {
  return new Promise((resolve, reject) => {
    const { title, nameQuery = '' } = options;
    const view: any = {};
    const apply: any = {};
    if (ageRange?.minAge) {
      view['min_age'] = ageRange?.minAge;
      apply['min_age'] = ageRange?.minAge;
    }
    if (ageRange?.maxAge) {
      view['max_age'] = ageRange?.maxAge;
      apply['max_age'] = ageRange?.maxAge;
    }
    filtersDataList.forEach((element: any) => {
      if (Object.keys(element?.selected).length !== 0) {
        view[element.apiKey] = element?.selected?.value;
        apply[element.apiKey] = element?.selected?.id;
      }
    });
    const params = {
      apply: apply,
      view: view,
      title: title,
    };
    onSearch(ageRange, filtersDataList, nameQuery)
      .then((res) => {
        if (Object.keys(params?.apply).length === 0) {
          flashErrorMessage('Please select atleast 1 filter');
          reject('');
        } else {
          ApiServices.saveSearchFilter(params)
            .then(() => {
              resolve(res);
            })
            .catch(() => reject(''));
        }
      })
      .catch(() => reject(''));
  });
};

const getFilterItemLabel = (id: any) => {
  switch (id) {
    case 'gender':
      return LanguageKeys.gender;
    case 'min_age':
      return LanguageKeys.minimumAge;
    case 'max_age':
      return LanguageKeys.maximumAge;
    case 'height':
      return LanguageKeys.height;
    case 'is_job':
      return LanguageKeys.jobS;
    case 'sect_id':
      return LanguageKeys.sect;
    case 'weight':
      return LanguageKeys.weight;
    case 'is_wali':
      return LanguageKeys.withWali;
    case 'is_smoking':
      return LanguageKeys.smoking;
    case 'is_drinking':
      return LanguageKeys.drinkingHabits;
    case 'language_id':
      return LanguageKeys.language;
    case 'register_at':
      return LanguageKeys.registeredAt;
    case 'skin_tone_id':
      return LanguageKeys.skinTone;
    case 'ethinicity_id':
      return LanguageKeys.ethinicity;
    case 'hijab_level_id':
      return LanguageKeys.hijabLevel;
    case 'last_online_at':
      return LanguageKeys.lastOnlineAt;
    case 'nationality_id':
      return LanguageKeys.nationality;
    case 'education_level_id':
      return LanguageKeys.educationLevel;
    case 'has_profile_picture':
      return LanguageKeys.hasprofilePicture;
    case 'open_for_polygamy':
      return LanguageKeys.availableForSecondMarriage;
    case 'prayers_punctuality_id':
      return LanguageKeys.prayersPunctuality;
    case 'islamic_practice_level_id':
      return LanguageKeys.dedicationToIslam;
    default:
      return id;
  }
};

export { getFilterItemLabel, onSearch, saveAndSearch };
