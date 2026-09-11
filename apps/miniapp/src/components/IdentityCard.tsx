import { View, Image, Input, Button } from "@tarojs/components";
import "../styles/tokens.scss";
import "./IdentityCard.scss";

interface Props {
  nickname: string;
  avatarUrl: string;
  onChooseAvatar: (e: any) => void;
  onNickname: (v: string) => void;
  onSave: () => void;
}

/** 头像 + 昵称卡片：身份页与"我的"页共用，避免两套实现。 */
export default function IdentityCard({
  nickname,
  avatarUrl,
  onChooseAvatar,
  onNickname,
  onSave,
}: Props) {
  return (
    <View className="identity-card">
      <Button
        className="avatar-btn"
        openType="chooseAvatar"
        onChooseAvatar={onChooseAvatar}
      >
        {avatarUrl ? (
          <Image className="avatar" src={avatarUrl} />
        ) : (
          <View className="avatar avatar--placeholder">
            {nickname ? nickname[0] : "灵"}
          </View>
        )}
      </Button>

      <View className="identity-card__form">
        <Input
          className="nick-input"
          type={"nickname" as any}
          placeholder="点击填入昵称"
          value={nickname}
          onInput={(e) => onNickname(e.detail.value)}
        />
        <View className="identity-card__hint">
          仅用于在本机展示你的学习档案，不获取手机号。
        </View>
        <View className="btn btn--primary identity-card__save" onClick={onSave}>
          保存
        </View>
      </View>
    </View>
  );
}
