package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	fal "github.com/valksor/fal-go"
)

// ErrVideoRejected marks a request fal refused before accepting it, so nothing was bought.
var ErrVideoRejected = errors.New("video request rejected")

const maxVideoBytes = 400 * 1024 * 1024

// FalVideos generates video through fal's queue. Status and cost reads are the
// same receipt reads image generation uses; submission and the result differ.
type FalVideos struct {
	images   *FalImages
	key      string
	submit   *http.Client
	download *http.Client
	sdk      *fal.Client
}

func NewFalVideos(key string) *FalVideos {
	noRedirect := func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	submit := &http.Client{Timeout: 45 * time.Second, CheckRedirect: noRedirect}
	return &FalVideos{
		images:   NewFalImages(key),
		key:      key,
		submit:   submit,
		download: &http.Client{Timeout: 10 * time.Minute, CheckRedirect: noRedirect},
		sdk:      fal.New(fal.WithKey(key), fal.WithHTTPClient(submit)),
	}
}

// SubmitVideo sends the paid request exactly once; a lost response is ambiguous,
// never permission to buy another video.
func (f *FalVideos) SubmitVideo(ctx context.Context, input VideoRequest) (string, error) {
	body, err := json.Marshal(input.Input)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://queue.fal.run/"+input.Endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Key "+f.key)
	req.Header.Set("Content-Type", "application/json")
	req.GetBody = nil
	resp, err := f.submit.Do(req)
	if err != nil {
		return "", errors.New("fal submission receipt unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode < 500 && resp.StatusCode != 408 {
		return "", ErrVideoRejected
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", errors.New("fal submission receipt unavailable")
	}
	var receipt struct {
		RequestID string `json:"request_id"`
	}
	if json.NewDecoder(io.LimitReader(resp.Body, 64*1024)).Decode(&receipt) != nil || !validImageRequestID(receipt.RequestID) {
		return "", errors.New("fal submission receipt unavailable")
	}
	return receipt.RequestID, nil
}

func (f *FalVideos) VideoStatus(ctx context.Context, endpoint, id string) (ImageStatus, error) {
	return f.images.ImageStatus(ctx, endpoint, id)
}

func (f *FalVideos) VideoCost(ctx context.Context, endpoint, id string) (*int64, error) {
	return f.images.ImageCost(ctx, endpoint, id)
}

func (f *FalVideos) VideoResult(ctx context.Context, endpoint, id string) ([]byte, error) {
	if !validImageRequestID(id) {
		return nil, errors.New("invalid fal receipt")
	}
	result, err := f.sdk.Result(ctx, endpoint, id)
	if err != nil {
		return nil, errors.New("fal result unavailable")
	}
	location, err := videoResultLocation(result)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, location.String(), nil)
	if err != nil {
		return nil, err
	}
	// Never send the provider key to the media host.
	resp, err := f.download.Do(req)
	if err != nil {
		return nil, errors.New("fal video download unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("fal video download failed")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxVideoBytes+1))
	if err != nil || len(data) > maxVideoBytes {
		return nil, errors.New("fal video exceeds download limit")
	}
	return data, nil
}

// videoResultLocation reads `video.url` and accepts only fal's media hosts and
// the storage bucket some fal models deliver from.
func videoResultLocation(result any) (*url.URL, error) {
	body, err := json.Marshal(result)
	if err != nil || len(body) > 1024*1024 {
		return nil, errors.New("invalid fal result")
	}
	var output struct {
		Video struct {
			URL string `json:"url"`
		} `json:"video"`
	}
	if json.Unmarshal(body, &output) != nil || output.Video.URL == "" {
		return nil, errors.New("invalid fal video")
	}
	location, err := url.Parse(output.Video.URL)
	if err != nil || location.Scheme != "https" || location.User != nil || location.Port() != "" {
		return nil, errors.New("invalid fal video location")
	}
	host := location.Hostname()
	if !strings.HasSuffix(host, ".fal.media") && host != "storage.googleapis.com" {
		return nil, errors.New("invalid fal video location")
	}
	return location, nil
}
