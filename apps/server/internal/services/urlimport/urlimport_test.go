package urlimport

import (
	"context"
	"errors"
	"net"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type fixedResolver map[string]string

func (r fixedResolver) LookupIPAddr(_ context.Context, host string) ([]net.IPAddr, error) {
	ip, ok := r[host]
	if !ok {
		return nil, errors.New("no such host")
	}
	return []net.IPAddr{{IP: net.ParseIP(ip)}}, nil
}

func testImporter(t *testing.T, run func(dir string, args []string) ([]byte, error)) *Importer {
	t.Helper()
	importer := New(Config{Enabled: true, MaxBytes: 1000, Timeout: time.Minute, Slots: 1})
	importer.resolver = fixedResolver{"video.example": "93.184.216.34", "internal.example": "10.0.0.5"}
	importer.run = func(_ context.Context, _ string, args ...string) ([]byte, error) {
		output := args[slices.Index(args, "-o")+1]
		return run(filepath.Dir(output), args)
	}
	return importer
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	require.NoError(t, os.WriteFile(path, []byte(content), 0o600))
}

func TestFetchReturnsTheMediaAndPageDetails(t *testing.T) {
	var gotArgs []string
	importer := testImporter(t, func(dir string, args []string) ([]byte, error) {
		gotArgs = args
		writeFile(t, filepath.Join(dir, "media.mp4"), "video-bytes")
		writeFile(t, filepath.Join(dir, "media.info.json"), `{"title":"Lamp: setup / tips?","uploader":"Studio","webpage_url":"https://video.example/v/1","id":"v1","extractor_key":"Generic"}`)
		return nil, nil
	})

	download, err := importer.Fetch(t.Context(), " https://video.example/v/1 ")
	require.NoError(t, err)
	t.Cleanup(func() { _ = download.Close() })

	require.Equal(t, "video/mp4", download.MimeType)
	require.Equal(t, "Lamp setup tips.mp4", download.FileName)
	require.Equal(t, int64(len("video-bytes")), download.Size)
	require.Equal(t, Source{Title: "Lamp: setup / tips?", Uploader: "Studio", PageURL: "https://video.example/v/1", ID: "v1", Extractor: "Generic"}, download.Source)
	require.Contains(t, gotArgs, "--ignore-config")
	require.Contains(t, gotArgs, "--no-playlist")
	require.NotContains(t, gotArgs, "--cookies")
	require.Equal(t, "https://video.example/v/1", gotArgs[len(gotArgs)-1])
	require.Equal(t, "--", gotArgs[len(gotArgs)-2], "the link can never be read as an option")

	dir := filepath.Dir(download.Path)
	require.NoError(t, download.Close())
	_, err = os.Stat(dir)
	require.True(t, os.IsNotExist(err), "Close removes the temp folder")
}

func TestFetchRefusesWhatItShouldNotRun(t *testing.T) {
	ran := false
	importer := testImporter(t, func(string, []string) ([]byte, error) {
		ran = true
		return nil, nil
	})
	for _, link := range []string{"file:///etc/passwd", "https://internal.example/x", "http://127.0.0.1/x", "https://video.example:8443/x", "not a url"} {
		_, err := importer.Fetch(t.Context(), link)
		require.ErrorIs(t, err, ErrInvalidURL, link)
	}
	require.False(t, ran, "yt-dlp never sees a refused link")

	disabled := New(Config{})
	_, err := disabled.Fetch(t.Context(), "https://video.example/v/1")
	require.ErrorIs(t, err, ErrDisabled)
}

func TestFetchHoldsOneSlotPerDownload(t *testing.T) {
	release := make(chan struct{})
	started := make(chan struct{})
	importer := testImporter(t, func(dir string, _ []string) ([]byte, error) {
		close(started)
		<-release
		writeFile(t, filepath.Join(dir, "media.mp4"), "x")
		return nil, nil
	})
	done := make(chan error, 1)
	go func() {
		download, err := importer.Fetch(context.Background(), "https://video.example/v/1")
		if download != nil {
			_ = download.Close()
		}
		done <- err
	}()
	<-started
	_, err := importer.Fetch(t.Context(), "https://video.example/v/2")
	require.ErrorIs(t, err, ErrBusy)
	close(release)
	require.NoError(t, <-done)
}

func TestFetchExplainsFailures(t *testing.T) {
	cases := []struct {
		name  string
		run   func(dir string) ([]byte, error)
		check func(t *testing.T, err error)
	}{
		{"yt-dlp message", func(string) ([]byte, error) {
			return []byte("[generic] page\nERROR: [generic] Unsupported URL: https://video.example/v/1\n"), errors.New("exit status 1")
		}, func(t *testing.T, err error) {
			require.EqualError(t, err, "[generic] Unsupported URL: https://video.example/v/1")
		}},
		{"size limit", func(string) ([]byte, error) {
			return []byte("ERROR: File is larger than max-filesize (2000 bytes > 1000 bytes). Aborting.\n"), errors.New("exit status 1")
		}, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrTooLarge) }},
		{"file over the limit anyway", func(dir string) ([]byte, error) {
			return nil, os.WriteFile(filepath.Join(dir, "media.mp4"), make([]byte, 2000), 0o600)
		}, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrTooLarge) }},
		{"nothing downloaded", func(dir string) ([]byte, error) {
			return nil, os.WriteFile(filepath.Join(dir, "media.info.json"), []byte(`{}`), 0o600)
		}, func(t *testing.T, err error) { require.ErrorIs(t, err, ErrNoMedia) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var dir string
			importer := testImporter(t, func(d string, _ []string) ([]byte, error) {
				dir = d
				return tc.run(d)
			})
			_, err := importer.Fetch(t.Context(), "https://video.example/v/1")
			tc.check(t, err)
			_, statErr := os.Stat(dir)
			require.True(t, os.IsNotExist(statErr), "a failed download leaves no files")
		})
	}
}
