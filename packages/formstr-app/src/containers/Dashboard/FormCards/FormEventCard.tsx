import { Tag } from "@formstr/sdk/dist/formstr/nip101";
import { Button, Card, Divider } from "antd";
import { Event } from "nostr-tools";
import { useNavigate } from "react-router-dom";
import DeleteFormTrigger from "./DeleteForm";
import {
  downloadHTMLToDevice,
  makeFormNAddr,
  naddrUrl,
} from "../../../utils/utility";
import {
  editPath,
  getDecryptedForm,
  responsePath,
} from "../../../utils/formUtils";
import ReactMarkdown from "react-markdown";
import { DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import DuplicateForm from "./DuplicateForm";

interface FormEventCardProps {
  event: Event;
  onDeleted?: () => void;
  relay?: string;
  secretKey?: string;
  viewKey?: string;
}
export const FormEventCard: React.FC<FormEventCardProps> = ({
  event,
  onDeleted,
  relay,
  secretKey,
  viewKey,
}) => {
  const navigate = useNavigate();
  const publicForm = event.content === "";
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    const initialize = async () => {
      if (event.content === "") {
        setTags(event.tags);
        return;
      } else if (viewKey) {
        setTags(getDecryptedForm(event, viewKey));
      }
    };
    initialize();
  }, []);
  const name = event.tags.find((tag: Tag) => tag[0] === "name") || [];
  const pubKey = event.pubkey;
  const formId = event.tags.find((tag: Tag) => tag[0] === "d")?.[1];
  const relays = event.tags
    .filter((tag: Tag) => tag[0] === "relay")
    .map((t) => t[1]);
  if (!formId) {
    return <Card title="Invalid Form Event">{JSON.stringify(event)}</Card>;
  }
  const formKey = `${pubKey}:${formId}`;
  let settings: { description?: string } = {};
  if (publicForm || viewKey) {
    settings = JSON.parse(
      tags.filter((t) => t[0] === "settings")?.[0]?.[1] || "{}",
    );
  }

  const downloadForm = async () => {
    const naddr = makeFormNAddr(
      pubKey,
      formId,
      relays.length ? relays : ["wss://relay.damus.io"],
    );
    const formFillerUI = (await (await fetch("/api/form-filler-ui")).text())
      ?.replace("@naddr", naddr)
      .replace("@viewKey", viewKey || "");
    downloadHTMLToDevice(formFillerUI, name[1]);
  };

  return (
    <Card
      title={name[1] || "Hidden Form"}
      className="form-card"
      extra={
        <div style={{ display: "flex", flexDirection: "row" }}>
          <DownloadOutlined
            onClick={downloadForm}
            style={{
              color: "purple",
              marginBottom: 3,
              marginRight: 14,
              cursor: "pointer",
            }}
          />
          {secretKey ? (
            <>
              <EditOutlined
                style={{ color: "purple", marginBottom: 3, marginRight: 14 }}
                onClick={() =>
                  navigate(editPath(secretKey, formId, relay, viewKey))
                }
              />
              <DuplicateForm tags={tags} />
            </>
          ) : null}
          {onDeleted ? (
            <DeleteFormTrigger formKey={formKey} onDeleted={onDeleted} />
          ) : null}
        </div>
      }
      style={{
        fontSize: 12,
        color: "grey",
        overflow: "clip",
      }}
    >
      <div
        style={{
          maxHeight: 100,
          textOverflow: "ellipsis",
          marginBottom: 30,
        }}
      >
        <ReactMarkdown>
          {settings.description
            ? settings.description?.trim().substring(0, 200) + "..."
            : "Encrypted Content"}
        </ReactMarkdown>
      </div>
      <Divider />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Button
            onClick={(e) => {
              secretKey
                ? navigate(responsePath(secretKey, formId, relay, viewKey))
                : navigate(`/r/${pubKey}/${formId}`);
            }}
            type="dashed"
            style={{
              color: "purple",
              borderColor: "purple",
            }}
          >
            View Responses
          </Button>
          <Button
            onClick={(e: any) => {
              e.stopPropagation();
              navigate(
                naddrUrl(
                  pubKey,
                  formId,
                  relays.length ? relays : ["wss://relay.damus.io"],
                  viewKey,
                ),
              );
            }}
            style={{
              marginLeft: "10px",
              color: "green",
              borderColor: "green",
            }}
            type="dashed"
          >
            Open Form
          </Button>
        </div>
        <div style={{ margin: 7 }}>
          {new Date(event.created_at * 1000).toDateString()}
        </div>
      </div>
    </Card>
  );
};
