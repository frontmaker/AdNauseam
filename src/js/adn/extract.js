var dbugDetect = 0; // tmp

// Injected into content pages before contentscript-end.js
// jQuery polyfill: $is, $find, $attr, $text
(function (self) {

  'use strict';

  var adDetector = self.adDetector = self.adDetector || {};

  if (adDetector.findAds) return;

  vAPI.messaging.addChannelListener('adnauseam', messageListener);

  adDetector.findAds = function (elem) {

    // TODO: enable once all text-ad filters are working
    var activeFilters = true ? filters : filters.filter(function (f) {
      return f.domain.test(document.domain);
    });

    if (elem.tagName === 'IFRAME') {
        //var c = elem.contentDocument || elem.contentWindow.document;
        //console.log($find(elem,'img').length, c);
        return; // Ignore iframes, wait for sub-elements?
    }

    //elem.style.setProperty('display', 'none', 'important');

    if (elem.tagName === 'IMG') {

      return checkImages(elem, [elem]);
    }

    var imgs = elem.querySelectorAll('img');
    if (imgs.length) {

      return checkImages(elem, imgs);
    }

    var ads = checkFilters(activeFilters, elem);
    if (ads && ads.length) {

      for (var i = 0; i < ads.length; i++) {

        if (ads[i]) {
          console.log("TEXT-AD", ads[i]);
          notifyAddon(ads[i], elem);
        }
      }
    }
  }

  var pageCount = function(ads, pageUrl) {

    var num = 0;
    for (var i = 0; i < ads.length; i++) {
      if (ads[i].pageUrl === pageUrl)
        num++;
    }
    return num;
  }

  var clickableParent = function (node) {

    var checkParent = function (adNode) {

      var hasParent = adNode.parentNode &&
        (adNode.parentNode.tagName == 'A' ||
          adNode.parentNode.tagName == 'OBJECT' ||
          adNode.parentNode.tagName == 'IFRAME' ||
          (adNode.hasAttribute && adNode.hasAttribute('onclick')));

      //console.log("check",adNode.tagName,adNode.parentNode);

      return hasParent;
    };

    var adNode = node;

    while (checkParent(adNode))
      adNode = adNode.parentNode;

    // returns adnode if found, or null
    return adNode === node ? null : adNode;
  };

  var Ad = function (network, targetUrl, data) {

    this.id = null;
    this.attempts = 0;
    this.visitedTs = 0; // 0=unattempted, -timestamp=err, +timestamp=ok
    this.attemptedTs = 0;
    this.contentData = data;
    this.contentType = data.src ? 'img' : 'text';
    this.title = data.title || 'Pending';
    this.resolvedTargetUrl = null;
    this.foundTs = +new Date();
    this.targetUrl = targetUrl;
    this.pageTitle = null;
    this.pageUrl = null;
    this.errors = null;
  };

  var notifyAddon = function (ad) {

    vAPI.messaging.send('adnauseam', { what: 'registerAd', ad: ad });
  }

  var $is = function (elem, selector) { // jquery shim

    if (selector.nodeType) {
      return elem === selector;
    }

    var qa = (typeof (selector) === 'string' ?
        document.querySelectorAll(selector) : selector),
      length = qa.length,
      returnArr = [];

    while (length--) {
      if (qa[length] === elem) {
        return true;
      }
    }

    return false;
  };

  var $attr = function (ele, attr, val) { // jquery shim

    return val ? (ele.length ? ele[0] : ele).setAttribute(attr, val) :
        (ele.length ? ele[0] : ele).getAttribute(attr);
  };

  var $text = function (ele) { // jquery shim

    if (typeof ele.length === 'undefined')
      return ele.innerText || ele.textContent;

    var text = '';
    for (var i = 0; i < ele.length; i++) {
      text += ele[i].innerText || ele[i].textContent;
    }

    return text;
  };

  var $find = function (ele, selector) { // jquery shim

    return ele.querySelectorAll(selector);
  };

  var checkImages = function (elem, imgs) {

    var target, targetUrl, ad;

    for (var i = 0; i < imgs.length; i++) {

      var imgSrc = imgs[i].getAttribute("src");

      if (!imgSrc) {

        if (dbugDetect) console.log("No ImgSrc(#" + i + ")!", imgs[i]);
        continue;
      }

      target = clickableParent(imgs[i]);
      if (target) {

        if (target.tagName === 'A') {

          targetUrl = target.getAttribute("href");
          if (targetUrl) {

            console.log(elem.getBoundingClientRect(), imgs[i].getBoundingClientRect());

            ad = createAd(document.domain, targetUrl, {
              src: imgSrc
              // width: imgs[i].clientWidth,
              // height: imgs[i].clientHeight
            });

            if (ad) {

              console.log('IMG-AD', ad);
              notifyAddon(ad, elem);
            }

            // Need to check for div.onclick etc?
          } else if (dbugDetect) console.warn("Bail: Ad / no targetURL! imgSrc: " + imgSrc);

        } else if (dbugDetect) console.log("Bail: Non-anchor found: " + target.tagName);

      } else if (dbugDetect) console.log("Bail: No ClickableParent: " + imgSrc);
    }
  }

  var yahooText = function (e) {

    var ads = [],
      divs = $find(e, 'div.dd'); //#main > div > ol.a947i105t6.v119f

    //console.log('DL: '+divs.length);
    for (var i = 0; i < divs.length; i++) {

      var title = $find(divs[i], 'a.td-n'),
        site = $find(divs[i], 'a.xh52v4e'),
        text = $find(divs[i], 'a.fc-1st');

      if (text.length && site.length && title.length) {

        var ad = createAd('yahoo', $attr(title, 'href'), {
          title: $text(title),
          text: $text(text),
          site: $text(site)
        });

        ads.push(ad);

      } else {

        console.warn('yahooTextHandler.fail: ', divs[i]); //title, site, text);
      }

    }
    return ads;
    //console.log('HIT:: yahooText()', $find(e, 'div.layoutMiddle'));
  }

  var aolText = function (div) {

    var ad, title = $find(div, '.title span'),
      text = $find(div, '.desc span'),
      site = $find(div, '.durl span'),
      target = $find(div, '.title a');

    if (text.length && site.length && title.length && target.length) {

      ad = createAd('aol', $attr(target, 'href'), {
        title: $text(title),
        text: $text(text),
        site: $text(site)
      });

    } else {

      console.warn('TEXT: aolTextHandler.fail: ', text, site, document.title, document.URL);
    }

    return [ad];
  }

  var askText = function (dom) {

    var title = $find(dom, 'a.test_titleLink.d_'),
        site = $find(dom, 'a.test_domainLink.e_'),
        text1 = $find(dom, 'span.descText'),
        text2 = $find(dom, 'span.v_');

    var text = text(text1) + (stringNotEmpty(text2) ? $text(text2) : '');

    if (text.length && site.length && title.length) {
      var ad = createAd('ask', $attr(title, 'href'), {
        title: $text(title),
        site: $text(site),
        text: text
      });

    } else {

      console.warn('TEXT: askTextHandler.fail: ', text, site, document.URL, document.title);
    }

    return [ad];
  }

  function checkFilters(theFilters, elem) {

    for (var i = 0; i < theFilters.length; i++) {

      var filter = theFilters[i];

      if ($is(elem, filter.selector)) {

        if (filter.name === 'aol' && document.domain.indexOf('aol') < 0) // TMP-REMOVE
          continue;

        var result = filter.handler(elem);

        if (result) {

          if (!filter.domain.test(document.domain))
            console.warn("Text Ad failed filter-test: ", document.URL, filter);

          return result;
        }
      }
    }
  }

  var googleText = function (li) {

    var ad, title = $find(li, 'h3 a'),
      text = $find(li, '.ads-creative'),
      site = $find(li, '.ads-visurl cite');

    if (text.length && site.length && title.length) {

      ad = createAd('google', $attr(title, 'href'), {
        title: $text(title),
        text: $text(text),
        site: $text(site)
      });

    } else {

      console.warn('TEXT: googleTextHandler.fail: ', text, site, document.URL, document.title);
    }

    return [ad];
  }

  var googleRegex = /^(www\.)*google\.((com\.|co\.|it\.)?([a-z]{2})|com)$/i;

  var filters = [{
    selector: 'li.ads-ad',
    handler: googleText,
    name: 'google',
    domain: googleRegex
  }, {
    selector: '.ad.a_',
    handler: askText,
    name: 'ask',
    domain: /^.*\.ask\.com$/i
  }, {
    selector: '.ad',
    handler: aolText,
    name: 'aol',
    domain: /^.*\.aol\.com(\.([a-z]{2}))?$/i
  }, {
    selector: 'ol',
    handler: yahooText,
    name: 'yahoo',
    domain: /^.*\.yahoo\.com/i
  }];

  var createAd = function (network, target, data) {

    if (target.indexOf('//') === 0) { // move to core?

      target = 'http:' + target;

    } else if (target.indexOf('http') < 0) {

      console.warn("Ignoring Ad with targetUrl=" + target, arguments);
      return;
    }

    if (target === 'http://www.google.com/settings/ads/anonymous') { // refactor

      console.log("Ignoring AdChoices: ", img);
      return;
    }

    return new Ad(network, target, data);
  }

  var messageListener = function (request) {

      // this is a temporary means of injecting the adnauseam-count
      // div into top-level frames for checking via automated tests
      if (window === window.top && request.automated) {

          if (request.what === 'adDetected') {

              var count = pageCount(request.data, request.pageUrl),
                adndiv = document.getElementById("adnauseam-count");

              if (!adndiv) {

                  adndiv = document.createElement('div');
                  $attr(adndiv,'id', 'adnauseam-count');
                  var body = document.getElementsByTagName("body");
                  body.length && body[0].appendChild(adndiv);
                  //console.log("Injected: #adnauseam-count");
              }

              $attr(adndiv, 'count', count);
              // console.log("adndiv.attr('count', "+json.count+")");
              console.log("INSERT_COUNT="+count+")");
              //"=" + $attr(document.getElementById("adnauseam-count"), 'count'));
          }
      }
  }


})(this);

/******************************************************************************/