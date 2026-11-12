import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { memo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '../lib/i18n';
import { colors, radius, makeStyles } from '../lib/theme';
import type { Media } from '../lib/types';

interface Props {
  media: Media;
  baseUrl: string; // http(s)://host:port
  headers: Record<string, string>;
}

function fmtSize(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MediaViewImpl({ media, baseUrl, headers }: Props) {
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const url = media.url || `${baseUrl}/media/${media.id}`;
  const authHeaders = media.url ? undefined : headers;

  if (media.kind === 'image') {
    return (
      <Image
        source={{ uri: url, headers: authHeaders }}
        style={s.image}
        resizeMode="cover"
        onError={() => setError(true)}
        accessibilityLabel={media.name}
      />
    );
  }

  const open = async () => {
    setBusy(true);
    setError(false);
    try {
      const dir = new Directory(Paths.cache, 'hermes-media');
      if (!dir.exists) dir.create();
      const target = new File(dir, `${media.id}-${media.name || 'file'}`);
      if (!target.exists) await File.downloadFileAsync(url, target, { headers: authHeaders });
      await Sharing.shareAsync(target.uri, { mimeType: media.mime });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={s.file} onPress={open}>
      <Text style={s.fileIcon}>{media.kind === 'audio' ? '♪' : media.kind === 'video' ? '▶' : '▤'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.fileName} numberOfLines={1}>{media.name || media.kind}</Text>
        <Text style={s.fileMeta}>{error ? '⚠︎' : fmtSize(media.size)}</Text>
      </View>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={s.open}>{t.download}</Text>}
    </Pressable>
  );
}

export const MediaView = memo(MediaViewImpl);

const useStyles = makeStyles((colors, fs) => ({
  image: { width: 240, height: 240, borderRadius: radius.md, backgroundColor: colors.surface2, marginVertical: 4 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginVertical: 4, maxWidth: 320 },
  fileIcon: { color: colors.accent, fontSize: fs(22) },
  fileName: { color: colors.text, fontSize: fs(15) },
  fileMeta: { color: colors.textFaint, fontSize: fs(12) },
  open: { color: colors.accent, fontWeight: '600' },
}));
