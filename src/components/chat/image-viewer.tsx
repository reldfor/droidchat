import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ImageViewerProps = {
  imageUri: string | null;
  onClose: () => void;
};

export function ImageViewer({ imageUri, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={imageUri !== null}>
      <View style={styles.container}>
        <Pressable accessible={false} onPress={onClose} style={styles.backdrop}>
          {imageUri ? (
            <Image
              accessible={false}
              contentFit="contain"
              source={{ uri: imageUri }}
              style={styles.image}
            />
          ) : null}
        </Pressable>

        <Pressable
          accessibilityLabel="Close image"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            { top: insets.top + 12 },
            pressed && styles.closeButtonPressed,
          ]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={22}
            tintColor="#F4F7FA"
          />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050607',
  },
  backdrop: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 14,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: 'rgba(20, 22, 27, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(50, 54, 62, 0.9)',
  },
});
