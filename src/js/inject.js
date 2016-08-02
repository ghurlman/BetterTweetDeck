/* eslint no-underscore-dangle: 0 */

import config from 'config';

if (config.get('Client.debug')) {
  /**
   * Takes a node and fetches the chirp associated with it (useful for debugging)
   */
  window._BTDinspectChirp = (element) => {
    if (!element.closest('[data-key]') || !element.closest('[data-column]')) {
      throw new Error('Not a chirp');
    }

    const colKey = element.closest('[data-column]').getAttribute('data-column');
    const chirpKey = element.closest('article[data-key]').getAttribute('data-key');

    return TD.controller.columnManager.get(colKey).updateIndex[chirpKey];
  };
}

/**
 * Send messages to the content window with BTDC_ prefix
 */
const proxyEvent = (name, detail = {}) => {
  name = `BTDC_${name}`;
  let cache = [];
  detail = JSON.stringify(detail, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (cache.indexOf(val) !== -1 && !val.screenName) {
        return null;
      }
      cache.push(val);
    }

    return val;
  });
  cache = null;
  window.postMessage({ name, detail }, 'https://tweetdeck.twitter.com');
};

const postMessagesListeners = {
  BTDC_getOpenModalTweetHTML: (ev, data) => {
    const { tweetKey, colKey, modalHtml } = data;

    if (!TD.controller.columnManager.get(colKey)) {
      return;
    }

    const column = TD.controller.columnManager.get(colKey);
    const chirpsStack = [];
    let chirp = column.updateIndex[tweetKey];

    if (!chirp) {
      if (column.detailViewComponent.repliesTo && column.detailViewComponent.repliesTo.repliesTo) {
        chirpsStack.push(...column.detailViewComponent.repliesTo.repliesTo);
      }

      if (column.detailViewComponent.replies && column.detailViewComponent.replies.replies) {
        chirpsStack.push(...column.detailViewComponent.replies.replies);
      }

      chirp = chirpsStack.find(c => c.id === tweetKey);
    }

    if (!chirp) {
      chirp = column.updateIndex[column.detailViewComponent.chirp.id].messageIndex[tweetKey];
    }

    if (!chirp) {
      return;
    }

    const markup = chirp.renderInMediaGallery();

    proxyEvent('gotMediaGalleryChirpHTML', { markup, chirp, modalHtml, colKey });
  },
  BTDC_getChirpFromColumn: (ev, data) => {
    const { chirpKey, colKey } = data;

    if (!TD.controller.columnManager.get(colKey)) {
      return;
    }

    const chirp = TD.controller.columnManager.get(colKey).updateIndex[chirpKey];

    if (!chirp) {
      return;
    }

    proxyEvent('gotChirpForColumn', { chirp, colKey });
  },
  BTDC_likeChirp: (ev, data) => {
    const { chirpKey, colKey } = data;

    if (!TD.controller.columnManager.get(colKey)) {
      return;
    }

    const chirp = TD.controller.columnManager.get(colKey).updateIndex[chirpKey];

    if (!chirp) {
      return;
    }

    chirp.favorite();
  },
  BTDC_retweetChirp: (ev, data) => {
    const { chirpKey, colKey } = data;

    if (!TD.controller.columnManager.get(colKey)) {
      return;
    }

    const chirp = TD.controller.columnManager.get(colKey).updateIndex[chirpKey];

    if (!chirp) {
      return;
    }

    chirp.retweet();
  },
  BTDC_stopGifForChirp: (ev, data) => {
    const { chirpKey, colKey } = data;

    if ($(`[data-column="${colKey}"] [data-key="${chirpKey}"] video`).paused) {
      return;
    }

    setTimeout(() => {
      $(`[data-column="${colKey}"] [data-key="${chirpKey}"] [rel="pause"]`)[0].click();
    });
  },
};

window.addEventListener('message', (ev) => {
  if (ev.origin.indexOf('tweetdeck.') === -1) {
    return false;
  }

  if (!ev.data.name.startsWith('BTDC_') || !postMessagesListeners[ev.data.name]) {
    return false;
  }

  return postMessagesListeners[ev.data.name](ev, ev.data.detail);
});

const switchThemeClass = () => {
  document.body.dataset.btdtheme = TD.settings.getTheme();
};

document.addEventListener('DOMNodeInserted', (ev) => {
  const target = ev.target;
  // If the target of the event contains mediatable then we are inside the media modal
  if (target.classList && target.classList.contains('js-mediatable')) {
    const chirpKey = target.querySelector('[data-key]').getAttribute('data-key');
    const colKey = document.querySelector(`[data-column] [data-key="${chirpKey}"]`).closest('[data-column]').getAttribute('data-column');

    const chirp = TD.controller.columnManager.get(colKey).updateIndex[chirpKey];

    proxyEvent('gotChirpInMediaModal', { chirp });
  }

  if (!target.hasAttribute || !target.hasAttribute('data-key')) {
    return;
  }

  const chirpKey = target.getAttribute('data-key');
  const colKey = target.closest('.js-column').getAttribute('data-column');

  if (!TD.controller.columnManager.get(colKey)) {
    return;
  }

  const column = TD.controller.columnManager.get(colKey);
  let chirp = column.updateIndex[chirpKey];

  if (target.hasAttribute('data-account-key') && !target.hasAttribute('data-tweet-id') && !chirp) {
    chirp = column.updateIndex[column.detailViewComponent.chirp.id].messageIndex[chirpKey];
  }

  if (target.hasAttribute('data-account-key') && target.hasAttribute('data-tweet-id') && !chirp) {
    const chirpsStack = [];

    if (column.detailViewComponent.repliesTo && column.detailViewComponent.repliesTo.repliesTo) {
      chirpsStack.push(...column.detailViewComponent.repliesTo.repliesTo);
    }

    if (column.detailViewComponent.replies && column.detailViewComponent.replies.replies) {
      chirpsStack.push(...column.detailViewComponent.replies.replies);
    }

    chirp = chirpsStack.find(c => c.id === chirpKey);
  }

  if (!chirp) {
    return;
  }

  if (chirp._hasAnimatedGif) {
    const videoEl = $(`[data-key="${chirp.entities.media[0].id}"] video`)[0];

    if (videoEl && videoEl.paused) {
      return;
    }

    proxyEvent('chirpsWithGifs', {
      chirps: [chirp],
      colKey,
    });
  }

  proxyEvent('gotChirpForColumn', { chirp, colKey });
});

$(document).on('uiVisibleChirps', (ev, data) => {
  const { chirpsData, columnKey } = data;
  const isThereGifs = chirpsData.filter(chirp => chirp.chirp._hasAnimatedGif && !chirp.$elem[0].querySelector('video').paused).length > 0;

  if (isThereGifs) {
    proxyEvent('chirpsWithGifs', {
      chirps: chirpsData.filter(chirp => chirp.chirp._hasAnimatedGif),
      colKey: columnKey,
    });
  }
});

// TD Events
$(document).on('uiDetailViewOpening', (ev, data) => {
  if (config.get('Client.debug')) {
    window._BTDLastDetailColumn = data.column;
  }
  setTimeout(() => {
    let chirpsData = [];

    if (!['ONE_TO_ONE', 'GROUP_DM'].includes(data.column.detailViewComponent.chirp.type)) {
      chirpsData = [data.column.detailViewComponent.parentChirp];

      if (data.column.detailViewComponent.repliesTo && data.column.detailViewComponent.repliesTo.repliesTo) {
        chirpsData.push(...data.column.detailViewComponent.repliesTo.repliesTo);
      }

      if (data.column.detailViewComponent.replies && data.column.detailViewComponent.replies.replies) {
        chirpsData.push(...data.column.detailViewComponent.replies.replies);
      }

      proxyEvent(ev.type, {
        columnKey: data.column.model.privateState.key,
        // On va manger....DES CHIRPS
        chirpsData,
      });
    }
  }, 500);
});

$(document).on('dataColumns', (ev, data) => {
  const cols = data.columns.filter(col => col.model.state.settings).map((col) => ({
    id: col.model.privateState.key,
    mediaSize: col.model.state.settings.media_preview_size,
  }));

  proxyEvent('columnsChanged', cols);
});

$(document).on('uiToggleTheme', switchThemeClass);

// Will ensure we keep the media preview size value even when the user changes it
$(document).on('uiColumnUpdateMediaPreview', (ev, data) => {
  const id = ev.target.closest('.js-column').getAttribute('data-column');

  proxyEvent('columnMediaSizeUpdated', { id, size: data.value });
});

// We wait for the loading of the columns and we get all the media preview size
$(document).one('dataColumnsLoaded', () => {
  proxyEvent('ready');

  $('.js-column').each((i, el) => {
    let size = TD.storage.columnController.get($(el).data('column')).getMediaPreviewSize();

    if (!size) {
      size = 'medium';
    }

    $(el).attr('data-media-size', size);
  });

  const tasks = TD.controller.scheduler._tasks;

  switchThemeClass();

  // We delete the callback for the timestamp task so the content script can do it itself
  Object.keys(tasks).forEach((key) => {
    if (tasks[key].period === 30000) {
      tasks[key].callback = () => false;
    }
  });
});

$('body').on('click', '#open-modal', (ev) => {
  const isMediaModal = document.querySelector('.js-modal-panel .js-media-preview-container, .js-modal-panel iframe');

  if (!document.body.classList.contains('btd__minimal_mode') ||
  !isMediaModal) {
    return;
  }

  if (!ev.target.closest('.med-tray')
   && !ev.target.closest('.mdl-btn-media') && $('a[rel="dismiss"]')[0]
   && !ev.target.closest('.med-tweet')) {
    ev.preventDefault();
    ev.stopPropagation();

    if ($('#open-modal [btd-custom-modal]').length) {
      $('#open-modal').css('display', 'none');
      $('#open-modal').empty();
      return;
    }

    $('a[rel="dismiss"]').click();
    return;
  }
});
